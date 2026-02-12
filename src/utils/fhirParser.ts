import { Logger } from "./Logger";
import { JSDOM } from "jsdom";
import * as N3 from 'n3';
const { Parser, Writer, DataFactory } = N3;
const { namedNode, literal } = DataFactory;

/**
 * Supported FHIR content types for request/response handling
 */
export const FHIR_CONTENT_TYPES = {
    JSON: 'application/fhir+json',
    JSON_ALT: 'application/json',
    XML: 'application/fhir+xml',
    XML_ALT: 'application/xml',
    RDF_TURTLE: 'application/fhir+turtle',
    RDF_TURTLE_ALT: 'text/turtle',
    RDF_N3: 'text/n3',
} as const;

/**
 * Determines FHIR format based on Content-Type header
 */
export type FhirFormat = 'json' | 'xml' | 'turtle' | 'n3';

/**
 * Parse Content-Type header and return FHIR format
 */
export function getFhirFormatFromContentType(contentType: string | undefined): FhirFormat {
    if (!contentType) {
        return 'json'; // Default to JSON
    }

    const type = contentType.toLowerCase().split(';')[0].trim();

    if (type === FHIR_CONTENT_TYPES.JSON || type === FHIR_CONTENT_TYPES.JSON_ALT) {
        return 'json';
    }
    if (type === FHIR_CONTENT_TYPES.XML || type === FHIR_CONTENT_TYPES.XML_ALT) {
        return 'xml';
    }
    if (type === FHIR_CONTENT_TYPES.RDF_TURTLE || type === FHIR_CONTENT_TYPES.RDF_TURTLE_ALT) {
        return 'turtle';
    }
    if (type === FHIR_CONTENT_TYPES.RDF_N3) {
        return 'n3';
    }

    // Default to JSON for unknown types
    Logger.logWarn("fhirParser.ts", "getFhirFormatFromContentType", 
        `Unknown content type: ${contentType}, defaulting to JSON`);
    return 'json';
}

/**
 * Parse FHIR resource from string based on format
 * Note: RDF formats (turtle/n3) return a Promise, while JSON/XML are synchronous
 */
export function parseFhirResource(data: string, format: FhirFormat): any | Promise<any> {
    try {
        switch (format) {
            case 'json':
                return JSON.parse(data);
            
            case 'xml':
                return parseFhirXml(data);
            
            case 'turtle':
            case 'n3':
                // RDF parsing is async
                return parseFhirRdf(data, format);
            
            default:
                Logger.logError("fhirParser.ts", "parseFhirResource", 
                    `Unsupported format: ${format}`);
                throw new Error(`Unsupported FHIR format: ${format}`);
        }
    } catch (error: any) {
        Logger.logError("fhirParser.ts", "parseFhirResource", 
            `Failed to parse FHIR ${format}: ${error.message}`);
        throw new Error(`Failed to parse FHIR ${format}: ${error.message}`);
    }
}

/**
 * Parse FHIR XML to JSON representation
 * Uses a simplified parser for common FHIR XML structures
 */
function parseFhirXml(xmlString: string): any {
    const dom = new JSDOM(xmlString, { contentType: 'text/xml' });
    const doc = dom.window.document;
    
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('Invalid XML: ' + parseError.textContent);
    }

    const rootElement = doc.documentElement;
    
    if (!rootElement) {
        throw new Error('No root element found in XML');
    }

    return xmlNodeToObject(rootElement);
}

/**
 * Convert XML node to JSON object following FHIR conventions
 */
function xmlNodeToObject(node: Element): any {
    const obj: any = {};

    // Get resource type from tag name
    obj.resourceType = node.tagName;

    // Process attributes
    for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        if (attr.name !== 'xmlns' && !attr.name.startsWith('xmlns:')) {
            obj[attr.name] = attr.value;
        }
    }

    // Process child elements
    const children = Array.from(node.children);
    for (const child of children) {
        const tagName = child.tagName;
        
        // Handle value attribute (FHIR primitive types)
        if (child.hasAttribute('value')) {
            const value = child.getAttribute('value');
            
            if (obj[tagName]) {
                // Convert to array if multiple elements with same name
                if (!Array.isArray(obj[tagName])) {
                    obj[tagName] = [obj[tagName]];
                }
                obj[tagName].push(value);
            } else {
                obj[tagName] = value;
            }
        } 
        // Handle nested elements
        else if (child.children.length > 0) {
            const childObj = xmlNodeToObject(child);
            delete childObj.resourceType; // Remove resourceType from nested objects
            
            if (obj[tagName]) {
                if (!Array.isArray(obj[tagName])) {
                    obj[tagName] = [obj[tagName]];
                }
                obj[tagName].push(childObj);
            } else {
                obj[tagName] = childObj;
            }
        }
    }

    return obj;
}

/**
 * Parse FHIR RDF (Turtle/N3) to JSON representation
 * Uses N3.js library to parse RDF triples and convert to FHIR JSON structure
 */
async function parseFhirRdf(rdfString: string, format: 'turtle' | 'n3'): Promise<any> {
    return new Promise((resolve, reject) => {
        const parser = new Parser({ format: format === 'turtle' ? 'text/turtle' : 'text/n3' });
        const quads: N3.Quad[] = [];
        
        parser.parse(rdfString, (error, quad, _prefixes) => {
            if (error) {
                Logger.logError("fhirParser.ts", "parseFhirRdf", 
                    `RDF parsing error: ${error.message}`);
                reject(new Error(`Failed to parse ${format}: ${error.message}`));
                return;
            }
            
            if (quad) {
                quads.push(quad);
            } else {
                // Parsing complete, convert triples to JSON
                try {
                    const fhirJson = convertRdfToFhirJson(quads);
                    resolve(fhirJson);
                } catch (conversionError: any) {
                    Logger.logError("fhirParser.ts", "parseFhirRdf", 
                        `RDF to JSON conversion error: ${conversionError.message}`);
                    reject(new Error(`Failed to convert ${format} to JSON: ${conversionError.message}`));
                }
            }
        });
    });
}

/**
 * Convert RDF quads to FHIR JSON structure
 * Follows FHIR RDF format specification
 */
function convertRdfToFhirJson(quads: N3.Quad[]): any {
    const FHIR_NS = 'http://hl7.org/fhir/';
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    
    // Group quads by subject
    const subjects = new Map<string, N3.Quad[]>();
    let rootSubject: string | null = null;
    
    for (const quad of quads) {
        const subjectValue = quad.subject.value;
        if (!subjects.has(subjectValue)) {
            subjects.set(subjectValue, []);
        }
        subjects.get(subjectValue)!.push(quad);
        
        // Find root resource (has rdf:type that is a FHIR resource)
        if (quad.predicate.value === RDF_TYPE && 
            quad.object.value.startsWith(FHIR_NS)) {
            rootSubject = subjectValue;
        }
    }
    
    if (!rootSubject) {
        throw new Error('No FHIR resource found in RDF data');
    }
    
    // Convert root subject to JSON
    return convertSubjectToJson(rootSubject, subjects, FHIR_NS);
}

/**
 * Convert an RDF subject and its predicates to JSON object
 */
function convertSubjectToJson(
    subject: string, 
    allSubjects: Map<string, N3.Quad[]>, 
    fhirNs: string
): any {
    const quads = allSubjects.get(subject);
    if (!quads) {
        return null;
    }
    
    const json: any = {};
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    
    for (const quad of quads) {
        const predicate = quad.predicate.value;
        const object = quad.object;
        
        // Extract property name from predicate URI
        let propertyName: string;
        if (predicate === RDF_TYPE) {
            // Get resource type
            if (object.value.startsWith(fhirNs)) {
                json.resourceType = object.value.substring(fhirNs.length);
            }
            continue;
        } else if (predicate.startsWith(fhirNs)) {
            propertyName = predicate.substring(fhirNs.length);
        } else {
            // Skip non-FHIR predicates
            continue;
        }
        
        // Get property value
        let value: any;
        if (object.termType === 'Literal') {
            value = object.value;
            // Try to parse as number or boolean
            if (object.datatype) {
                const datatype = object.datatype.value;
                if (datatype.includes('boolean')) {
                    value = object.value === 'true';
                } else if (datatype.includes('integer') || datatype.includes('decimal')) {
                    value = Number(object.value);
                }
            }
        } else if (object.termType === 'NamedNode') {
            // Check if this is a reference to another subject
            if (allSubjects.has(object.value)) {
                value = convertSubjectToJson(object.value, allSubjects, fhirNs);
            } else {
                value = object.value;
            }
        } else {
            value = object.value;
        }
        
        // Handle multiple values (arrays)
        if (json[propertyName] !== undefined) {
            if (!Array.isArray(json[propertyName])) {
                json[propertyName] = [json[propertyName]];
            }
            json[propertyName].push(value);
        } else {
            json[propertyName] = value;
        }
    }
    
    return json;
}

/**
 * Serialize FHIR resource to string based on format
 * Note: RDF formats return a Promise, while JSON/XML are synchronous
 */
export function serializeFhirResource(resource: any, format: FhirFormat): string | Promise<string> {
    try {
        switch (format) {
            case 'json':
                return JSON.stringify(resource, null, 2);
            
            case 'xml':
                return serializeFhirXml(resource);
            
            case 'turtle':
            case 'n3':
                // RDF serialization is async
                return serializeFhirRdf(resource, format);
            
            default:
                throw new Error(`Unsupported FHIR format: ${format}`);
        }
    } catch (error: any) {
        Logger.logError("fhirParser.ts", "serializeFhirResource", 
            `Failed to serialize FHIR ${format}: ${error.message}`);
        throw new Error(`Failed to serialize FHIR ${format}: ${error.message}`);
    }
}

/**
 * Serialize FHIR JSON to XML
 */
function serializeFhirXml(resource: any): string {
    const resourceType = resource.resourceType || 'Resource';
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<${resourceType} xmlns="http://hl7.org/fhir">\n`;
    
    xml += objectToXmlElements(resource, 1);
    
    xml += `</${resourceType}>`;
    return xml;
}

/**
 * Convert JSON object to XML elements
 */
function objectToXmlElements(obj: any, indent: number = 0): string {
    const indentStr = '  '.repeat(indent);
    let xml = '';

    for (const key in obj) {
        if (key === 'resourceType') continue;
        
        const value = obj[key];
        
        if (value === null || value === undefined) {
            continue;
        }
        
        if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item === 'object') {
                    xml += `${indentStr}<${key}>\n`;
                    xml += objectToXmlElements(item, indent + 1);
                    xml += `${indentStr}</${key}>\n`;
                } else {
                    xml += `${indentStr}<${key} value="${escapeXml(String(item))}" />\n`;
                }
            }
        } else if (typeof value === 'object') {
            xml += `${indentStr}<${key}>\n`;
            xml += objectToXmlElements(value, indent + 1);
            xml += `${indentStr}</${key}>\n`;
        } else {
            xml += `${indentStr}<${key} value="${escapeXml(String(value))}" />\n`;
        }
    }

    return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Serialize FHIR JSON to RDF (Turtle/N3)
 * Uses N3.js library to convert FHIR JSON structure to RDF triples
 */
function serializeFhirRdf(resource: any, format: 'turtle' | 'n3'): Promise<string> {
    const FHIR_NS = 'http://hl7.org/fhir/';
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';
    
    const writer = new Writer({ 
        format: format === 'turtle' ? 'text/turtle' : 'text/n3',
        prefixes: {
            fhir: FHIR_NS,
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            xsd: XSD_NS
        }
    });
    
    // Generate unique subject URI for the resource
    const resourceId = resource.id || 'resource';
    const subjectUri = `${FHIR_NS}${resource.resourceType}/${resourceId}`;
    
    // Add resource type triple
    if (resource.resourceType) {
        writer.addQuad(
            namedNode(subjectUri),
            namedNode(RDF_TYPE),
            namedNode(`${FHIR_NS}${resource.resourceType}`)
        );
    }
    
    // Convert JSON properties to RDF triples
    convertJsonToRdfQuads(resource, subjectUri, writer, FHIR_NS, XSD_NS);
    
    // Return Promise that resolves when writer finishes
    return new Promise<string>((resolve, reject) => {
        writer.end((error, result) => {
            if (error) {
                Logger.logError("fhirParser.ts", "serializeFhirRdf", 
                    `RDF serialization error: ${error.message}`);
                reject(new Error(`Failed to serialize to ${format}: ${error.message}`));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Convert FHIR JSON object properties to RDF quads
 */
function convertJsonToRdfQuads(
    obj: any, 
    subject: string, 
    writer: N3.Writer, 
    fhirNs: string,
    xsdNs: string,
    depth: number = 0
): void {
    // Prevent infinite recursion
    if (depth > 20) {
        Logger.logWarn("fhirParser.ts", "convertJsonToRdfQuads", 
            "Max recursion depth reached, skipping nested objects");
        return;
    }
    
    for (const key in obj) {
        if (key === 'resourceType' || key === 'id') {
            continue; // Already handled or metadata
        }
        
        const value = obj[key];
        const predicate = `${fhirNs}${key}`;
        
        if (value === null || value === undefined) {
            continue;
        }
        
        if (Array.isArray(value)) {
            // Handle arrays by creating multiple triples
            for (const item of value) {
                addValueQuad(subject, predicate, item, writer, fhirNs, xsdNs, depth);
            }
        } else {
            addValueQuad(subject, predicate, value, writer, fhirNs, xsdNs, depth);
        }
    }
}

/**
 * Add a single value as an RDF quad
 */
function addValueQuad(
    subject: string,
    predicate: string,
    value: any,
    writer: N3.Writer,
    fhirNs: string,
    xsdNs: string,
    depth: number
): void {
    if (typeof value === 'object' && value !== null) {
        // Create a blank node for nested objects
        const blankNodeId = `_:b${Math.random().toString(36).substr(2, 9)}`;
        writer.addQuad(
            namedNode(subject),
            namedNode(predicate),
            namedNode(blankNodeId)
        );
        
        // Recursively add properties of the nested object
        convertJsonToRdfQuads(value, blankNodeId, writer, fhirNs, xsdNs, depth + 1);
    } else if (typeof value === 'boolean') {
        writer.addQuad(
            namedNode(subject),
            namedNode(predicate),
            literal(String(value), namedNode(`${xsdNs}boolean`))
        );
    } else if (typeof value === 'number') {
        const datatype = Number.isInteger(value) ? 'integer' : 'decimal';
        writer.addQuad(
            namedNode(subject),
            namedNode(predicate),
            literal(String(value), namedNode(`${xsdNs}${datatype}`))
        );
    } else {
        // String or other primitive
        writer.addQuad(
            namedNode(subject),
            namedNode(predicate),
            literal(String(value))
        );
    }
}

/**
 * Get appropriate Content-Type header for format
 */
export function getContentTypeForFormat(format: FhirFormat): string {
    switch (format) {
        case 'json':
            return FHIR_CONTENT_TYPES.JSON;
        case 'xml':
            return FHIR_CONTENT_TYPES.XML;
        case 'turtle':
            return FHIR_CONTENT_TYPES.RDF_TURTLE;
        case 'n3':
            return FHIR_CONTENT_TYPES.RDF_N3;
        default:
            return FHIR_CONTENT_TYPES.JSON;
    }
}
