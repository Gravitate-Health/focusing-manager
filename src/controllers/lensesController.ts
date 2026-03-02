import { Response, Request } from "express";
import { HttpStatusCode } from "axios";
import { Logger } from "../utils/Logger";
import { LensesProvider } from "../providers/lenses.provider";

let lensesProvider = new LensesProvider("")

export const getLensesNames = async (_req: Request, res: Response) => {
    Logger.logInfo("lensesController.ts", "getLensesNames", "\n\n\n_____________ GET LENSES ____________")
    try {
        const lensesList = await lensesProvider.getAllAvailableLenses()
        res.status(HttpStatusCode.Ok).send({
            lenses: lensesList
        })
    } catch (error) {
        Logger.logError("lensesController.ts", "getLensesNames", `Error: ${error}`)
        res.status(HttpStatusCode.InternalServerError).send({
            error: "There was an error retrieving lenses"
        })
    }
}