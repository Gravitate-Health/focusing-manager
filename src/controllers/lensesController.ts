import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { LensesProvider } from "../providers/lenses.provider";
import { getFhirFormatFromContentType, serializeFhirResource } from "../utils/fhirParser";

let lensesProvider = new LensesProvider("")

export const getLensesNames = async (_req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "getLensesNames", "\n\n\n_____________ GET LENSES ____________")
    try {
        const lensesList = await lensesProvider.getAllAvailableLenses()
        // Allow caching by clients and network devices for 1 hour
        res.set("Cache-Control", "public, max-age=3600");
        res.status(HttpStatusCode.Ok).send({
            lenses: lensesList
        })
    } catch (error) {
        Logger.logError("lensesController.ts", "getLensesNames", `Error: ${error}`)
        res.set("Cache-Control", "no-cache, no-store, must-revalidate");
        res.status(HttpStatusCode.InternalServerError).send({
            error: "There was an error retrieving lenses"
        })
    }
}

export const getLensById = async (req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "getLensById", "\n\n\n_____________ GET LENS BY ID ____________")
    
    const lensId = req.params.lensId;
    
    if (!lensId) {
        Logger.logError("lensesController.ts", "getLensById", "No lens ID provided")
        res.set("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.status(HttpStatusCode.BadRequest).send({
            error: "Lens ID is required"
        });
    }

    try {
        // Parse lens ID to get selector and actual lens name
        const parsedLenses = await lensesProvider.parseLenses([lensId]);
        
        if (parsedLenses.length === 0) {
            Logger.logError("lensesController.ts", "getLensById", `Lens not found: ${lensId}`)
            res.set("Cache-Control", "no-cache, no-store, must-revalidate");
            return res.status(HttpStatusCode.NotFound).send({
                error: `Lens not found: ${lensId}`
            });
        }

        // Fetch the complete lens
        const { completeLenses, errors } = await lensesProvider.getCompleteLenses(parsedLenses);
        
        if (completeLenses.length === 0 || errors.length > 0) {
            Logger.logError("lensesController.ts", "getLensById", `Failed to retrieve lens: ${lensId}. Errors: ${JSON.stringify(errors)}`)
            res.set("Cache-Control", "no-cache, no-store, must-revalidate");
            return res.status(HttpStatusCode.NotFound).send({
                error: `Failed to retrieve lens: ${lensId}`,
                details: errors
            });
        }

        const lens = completeLenses[0];
        
        // Check Accept header to determine response format
        const acceptHeader = req.get('Accept') || 'application/fhir+json';
        
        // If JavaScript format is requested, extract and return just the lens code
        if (acceptHeader.toLowerCase().includes('javascript') || acceptHeader.toLowerCase().includes('text/javascript')) {
            Logger.logInfo("lensesController.ts", "getLensById", `Returning lens code for: ${lensId}`)
            
            // Extract lens code from FHIR Library resource
            if (lens.content && lens.content.length > 0 && lens.content[0].data) {
                const base64Code = lens.content[0].data;
                const lensCode = Buffer.from(base64Code, 'base64').toString('utf-8');
                
                res.set("Cache-Control", "public, max-age=3600");
                res.set("Content-Type", "application/javascript");
                return res.status(HttpStatusCode.Ok).send(lensCode);
            } else {
                Logger.logError("lensesController.ts", "getLensById", `Lens code not found in resource: ${lensId}`)
                res.set("Cache-Control", "no-cache, no-store, must-revalidate");
                return res.status(HttpStatusCode.InternalServerError).send({
                    error: "Lens code not found in resource"
                });
            }
        }
        
        // Otherwise, return the complete FHIR Library resource in requested format
        const format = getFhirFormatFromContentType(acceptHeader);
        Logger.logInfo("lensesController.ts", "getLensById", `Returning complete lens resource in ${format} format for: ${lensId}`)
        
        try {
            const serialized = await Promise.resolve(serializeFhirResource(lens, format));
            
            // Set appropriate Content-Type header
            let contentType = 'application/fhir+json';
            if (format === 'xml') {
                contentType = 'application/fhir+xml';
            } else if (format === 'turtle') {
                contentType = 'application/fhir+turtle';
            } else if (format === 'n3') {
                contentType = 'text/n3';
            }
            
            res.set("Cache-Control", "public, max-age=3600");
            res.set("Content-Type", contentType);
            return res.status(HttpStatusCode.Ok).send(serialized);
        } catch (serializationError: any) {
            Logger.logError("lensesController.ts", "getLensById", 
                `Failed to serialize lens to ${format}: ${serializationError.message}`)
            res.set("Cache-Control", "no-cache, no-store, must-revalidate");
            return res.status(HttpStatusCode.InternalServerError).send({
                error: `Failed to serialize lens to ${format}`,
                details: serializationError.message
            });
        }
        
    } catch (error: any) {
        Logger.logError("lensesController.ts", "getLensById", `Error: ${error.message || error}`)
        res.set("Cache-Control", "no-cache, no-store, must-revalidate");
        res.status(HttpStatusCode.InternalServerError).send({
            error: "There was an error retrieving the lens",
            details: error.message || String(error)
        })
    }
}