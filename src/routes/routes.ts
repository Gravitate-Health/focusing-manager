import { Router } from "express";
import * as preprocessingController from "../controllers/preprocessingController";
import * as lensesController from "../controllers/lensesController";
export const FocusingManagerRouter: Router = Router();

FocusingManagerRouter.get("/preprocessing", preprocessingController.getPreprocessingServices);
FocusingManagerRouter.post("/preprocessing/:epiId", preprocessingController.preprocess);
FocusingManagerRouter.get("/lenses", lensesController.getLensesNames);
FocusingManagerRouter.post("/focus/:epiId", lensesController.focus);
FocusingManagerRouter.post("/focus", lensesController.focus);
