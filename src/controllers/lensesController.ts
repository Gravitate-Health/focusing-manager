import { Response, Request } from "express";

export const lenses = async (req: Request, res: Response) => {
    res.status(200).send("Lenses")
}
