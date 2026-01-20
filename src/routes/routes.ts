import { Router } from "express";
import * as preprocessingController from "../controllers/preprocessingController.js";
import * as lensesController from "../controllers/lensesController.js";
export const FocusingManagerRouter: Router = Router();

FocusingManagerRouter.get("/preprocessing", preprocessingController.getPreprocessingServices);
FocusingManagerRouter.post("/preprocessing/:epiId", preprocessingController.preprocess);
FocusingManagerRouter.get("/lenses", lensesController.getLensesNames);
FocusingManagerRouter.post("/focus/:epiId", lensesController.baseRequest);
FocusingManagerRouter.post("/focus", lensesController.baseRequest);
