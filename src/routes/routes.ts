import { Router } from "express";
import * as preprocessingController from "../controllers/preprocessingController";
import * as lensesController from "../controllers/lensesController";
import * as focusingController from "../controllers/focusingController";
export const FocusingManagerRouter: Router = Router();

FocusingManagerRouter.get("/preprocessing", preprocessingController.preprocess);
FocusingManagerRouter.post("/preprocessing", preprocessingController.preprocess);
FocusingManagerRouter.get("/lenses", lensesController.lenses);
FocusingManagerRouter.post("/focus", focusingController.focus);
