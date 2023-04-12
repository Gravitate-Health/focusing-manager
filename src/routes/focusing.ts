import { Router } from "express";
import * as focusingController from "../controllers/focusing";
export const FocusingRouter: Router = Router();

FocusingRouter.get("/focusing", focusingController.focus);
