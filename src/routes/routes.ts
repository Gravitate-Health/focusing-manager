import { Router } from "express";
import * as preprocessingController from "../controllers/preprocessingController";
import * as lensesController from "../controllers/lensesController";
import * as focusController from "../controllers/focusController";
export const FocusingManagerRouter: Router = Router();

FocusingManagerRouter.get("/preprocessing", preprocessingController.getPreprocessingServices);
FocusingManagerRouter.get("/preprocessing/cache/stats", preprocessingController.getCacheStats);
FocusingManagerRouter.post("/preprocessing/:epiId", preprocessingController.preprocess);
FocusingManagerRouter.get("/lenses", lensesController.getLensesNames);
FocusingManagerRouter.post("/focus/:epiId", focusController.focus);
FocusingManagerRouter.post("/focus", focusController.focus);
