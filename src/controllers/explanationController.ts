import { Logger } from "../utils/Logger"
import { ConditionsProvider } from "../providers/conditions.provider"
import { AllergiesProvider } from "../providers/allergies.provider";

const FHIR_IPS_URL = process.env.FHIR_IPS_URL as string;

const conditionProvider = new ConditionsProvider(FHIR_IPS_URL)
const allergyIntoleranceProvider = new AllergiesProvider(FHIR_IPS_URL)

// Utility to extract explanation/report from FHIR Composition extensions
function getExtensionValue(epi: any, lensIdentifier: string, key: 'explanation' | 'report') {
    const extensions = epi?.entry?.[0]?.resource?.extension || [];
    for (const ext of extensions) {
        if (ext.url === "http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/LensesApplied") {
            const subExts = ext.extension || [];
            let foundLens = false;
            let value = undefined;
            for (const sub of subExts) {
                if (sub.url === "lens" && sub.valueCodeableReference?.reference?.reference === `Library/${lensIdentifier}`) {
                    foundLens = true;
                }
                if (sub.url === key) {
                    value = sub.valueString;
                }
            }
            if (foundLens && value) return value;
        }
    }
    return undefined;
}

const DEFAULT_MESSAGE = "This was highlighted because it's important for you.";

export const createExplanation = async (epi: any, lensIdentifier: string) => {
    Logger.logInfo("explanationController.ts", "createExplanation", "Fetching explanation from FHIR Composition extension")
    return getExtensionValue(epi, lensIdentifier, 'explanation') || DEFAULT_MESSAGE;
}

export const getReport = async (epi: any, lensIdentifier: string) => {
    Logger.logInfo("explanationController.ts", "getReport", "Fetching report from FHIR Composition extension")
    return getExtensionValue(epi, lensIdentifier, 'report') || DEFAULT_MESSAGE;
}