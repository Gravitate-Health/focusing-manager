import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { LensesProvider } from "../providers/lenses.provider";

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