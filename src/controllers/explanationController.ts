import { Logger } from "../utils/Logger"
import { explanation, Language, LensIdentifier } from "../templates/explanationTemplate"
import { ConditionsProvider } from "../providers/conditions.provider"
import { AllergiesProvider } from "../providers/allergies.provider";

const FHIR_IPS_URL = process.env.FHIR_IPS_URL as string;

const conditionProvider = new ConditionsProvider(FHIR_IPS_URL)
const allergyIntoleranceProvider = new AllergiesProvider(FHIR_IPS_URL)

export const createExplanation = async (ipsIdentifier: string, epiLanguage: Language, lensIdentifier: LensIdentifier) => {
    Logger.logInfo("explanationController.ts", "createExplanation", "Creating explanation")

    switch(lensIdentifier) {
        case "pregnancy-lens":
            return buildPregnancyExplanation(explanation[lensIdentifier][epiLanguage])
        case "conditions-lens":
            return await buildConditionExplanation(ipsIdentifier, explanation[lensIdentifier][epiLanguage])
        case "allergyintollerance-lens":
            return await buildAllergyIntolleranceExplanation(ipsIdentifier, explanation[lensIdentifier][epiLanguage])
        case "interaction-lens":
            return buildInteractionExplanation(explanation[lensIdentifier][epiLanguage])
        case "diabetes-lens":
            return "";
        default:
            return buildDefaultExplanation(explanation["default"][epiLanguage])
    }
}

const buildPregnancyExplanation = (explanationText: any): any => {
    return explanationText
}

const buildConditionExplanation = async (ipsIdentifier: string, rawExplanation: any) => {
    const conditionList = await conditionProvider.getConditionsByPatientIdentifier(ipsIdentifier)

    let explanationText
    
    if (conditionList === undefined) {
        explanationText = rawExplanation[0] + rawExplanation[1]
        return explanationText
    }

    for (let i = 0; i < conditionList.length; i++) {
        let condition = conditionList[i];

        condition = condition.replace(/\s*\(.*?\)\s*/g, '')
        condition = condition.trim()
        
        rawExplanation[0] += condition;
        
        if (i < conditionList.length - 1) {
            rawExplanation[0] += ", ";
        }
    }

    explanationText = rawExplanation[0]

    return explanationText
}

const buildAllergyIntolleranceExplanation = async (ipsIdentifier: string, explanationText: any) => {
    const allergyIntoleranceList = await allergyIntoleranceProvider.getAllergiesByPatientIdentifier(ipsIdentifier)

    if (allergyIntoleranceList === undefined) {
        return explanationText[0] + explanationText[2] + explanationText[1] + explanationText[3]
    }

    let finalExplanation = explanationText[0]
    for (let allergy of allergyIntoleranceList) {
        finalExplanation += allergy.type + explanationText[1] + `${allergy.causalAgent} `
    }
    return finalExplanation
}

const buildInteractionExplanation = (explanationText: any): any => {
    return explanationText
}

const buildDefaultExplanation = (explanationText: any): any => {
    return explanationText
}