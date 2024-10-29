import { Logger } from "../utils/Logger"
import { explanation } from "../templates/explanationTemplate"

export const createExplanation = (ips: JSON, language: string, lensIdentifier: string): any => {
    Logger.logInfo("explanationController.ts", "createExplanation", "Creating explanation")

    switch(lensIdentifier) {
        // to be done
    }
}

const buildPregnancyExplanation = (language: string): any => {
    // to be done
    return undefined
}
