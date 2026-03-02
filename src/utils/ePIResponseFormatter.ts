import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "./Logger";
import { readFileSync, existsSync } from "fs";
import { Liquid } from "liquidjs";
import { join } from "path";

/**
 * ePI Response Formatter
 * Handles content negotiation and formatting for ePI (electronic Product Information) responses
 * Supports: JSON, XML, Turtle/RDF, and HTML formats via Accept header
 */

/**
 * Get ePI template path for HTML rendering
 * Checks in build directory first, falls back to src
 */
export function getEpiTemplatePath(templateName: string): string {
  const buildPath = join(process.cwd(), 'build', 'templates', templateName);
  if (existsSync(buildPath)) {
    return buildPath;
  }
  return join(process.cwd(), 'src', 'templates', templateName);
}

/**
 * Check if client explicitly provided an Accept header
 */
export function hasExplicitAcceptHeader(req: Request): boolean {
  return req.headers.accept !== undefined && req.headers.accept.trim().length > 0;
}

/**
 * Convert ePI JSON object to XML string
 */
function convertEpiToXml(epi: any): string {
  try {
    const json2xml = require('json2xml');
    return json2xml(epi);
  } catch (error) {
    Logger.logWarn("epiResponseFormatter.ts", "convertEpiToXml", `Failed to convert ePI to XML: ${error}`);
    throw error;
  }
}

/**
 * Convert ePI JSON object to Turtle RDF format
 */
function convertEpiToTurtle(epi: any): string {
  const turtleLines: string[] = [];
  turtleLines.push('@prefix ex: <http://example.com/> .');
  turtleLines.push('@prefix fhir: <http://hl7.org/fhir/> .');
  turtleLines.push('');
  
  const subject = 'ex:epi';
  if (epi && typeof epi === 'object' && epi !== null) {
    for (const [key, value] of Object.entries(epi)) {
      if (value !== null && value !== undefined) {
        const predicate = `fhir:${key}`;
        const val = typeof value === 'string' ? `"${value}"` : String(value);
        turtleLines.push(`${subject} ${predicate} ${val} .`);
      }
    }
  }
  
  return turtleLines.join('\n');
}

/**
 * Render ePI data to HTML using Liquid template
 */
async function renderEpiAsHtml(epi: any): Promise<string> {
  const templatePath = getEpiTemplatePath('epi.liquid');
  
  if (!existsSync(templatePath)) {
    throw new Error(`ePI template file not found: ${templatePath}`);
  }
  
  const template = readFileSync(templatePath, "utf-8");
  const engine = new Liquid();
  return await engine.parseAndRender(template, epi);
}

/**
 * Send ePI response in the requested format (JSON, XML, Turtle, or HTML)
 * 
 * @param req Express request object
 * @param res Express response object
 * @param epi ePI data to send (should be JSON object)
 * @param statusCode HTTP status code (defaults to 200)
 * @param controllerName Name of calling controller for logging
 */
export async function sendEpiFormattedResponse(
  req: Request,
  res: Response,
  epi: any,
  statusCode: number = HttpStatusCode.Ok,
  controllerName: string = "epiResponseFormatter"
): Promise<void> {
  // Check if client provided explicit Accept header
  const hasAcceptHeader = hasExplicitAcceptHeader(req);
  
  // If no Accept header, default to HTML rendering
  if (!hasAcceptHeader) {
    try {
      const html = await renderEpiAsHtml(epi);
      res.set('Content-Type', 'text/html');
      res.status(statusCode).send(html);
      return;
    } catch (error) {
      Logger.logError(controllerName, "sendEpiFormattedResponse", `Error converting ePI to HTML: ${error}`);
      // Fallback to JSON on rendering failure
      res.set('Content-Type', 'application/json');
      res.status(statusCode).send(epi);
      return;
    }
  }

  // Client has explicit Accept header - check for specific formats
  // Check for XML
  if (req.accepts('xml') === 'xml') {
    res.set('Content-Type', 'application/xml');
    if (typeof epi === 'object') {
      try {
        const xml = convertEpiToXml(epi);
        res.status(statusCode).send(xml);
        return;
      } catch (error) {
        Logger.logWarn(controllerName, "sendEpiFormattedResponse", `Failed to convert ePI to XML, returning JSON`);
        res.set('Content-Type', 'application/json');
      }
    }
    res.status(statusCode).send(epi);
    return;
  }

  // Check for Turtle/RDF
  if (req.accepts('text/turtle') === 'text/turtle' || req.accepts('turtle') === 'turtle') {
    res.set('Content-Type', 'text/turtle');
    if (typeof epi === 'object') {
      try {
        const turtle = convertEpiToTurtle(epi);
        res.status(statusCode).send(turtle);
        return;
      } catch (error) {
        Logger.logWarn(controllerName, "sendEpiFormattedResponse", `Failed to convert ePI to Turtle, returning JSON`);
        res.set('Content-Type', 'application/json');
      }
    }
    res.status(statusCode).send(epi);
    return;
  }

  // Check for HTML
  if (req.accepts('html') === 'html') {
    try {
      const html = await renderEpiAsHtml(epi);
      res.set('Content-Type', 'text/html');
      res.status(statusCode).send(html);
      return;
    } catch (error) {
      Logger.logError(controllerName, "sendEpiFormattedResponse", `Error converting ePI to HTML: ${error}`);
      // Fallback to JSON on rendering failure
      res.set('Content-Type', 'application/json');
      res.status(statusCode).send(epi);
      return;
    }
  }

  // Default to JSON for any other Accept header or wildcard
  res.set('Content-Type', 'application/json');
  res.status(statusCode).send(epi);
}
