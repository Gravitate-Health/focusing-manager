import { Logger } from "../utils/Logger";

export class AllergiesProvider {
    baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    async getAllergiesByPatientIdentifier(patientIdentifier: string) {
        this.baseUrl = `${this.baseUrl}/AllergyIntolerance?patient.identifier=${patientIdentifier}`;
        let allergiesSearchSet;
        try {
            Logger.logInfo('AllergiesProvider.ts', 'getAllergiesByPatientIdentifier', 'Getting allergies by patient identifier');

            const response = await fetch(this.baseUrl)
    
            allergiesSearchSet = await response.json();
        } catch (error) {
            return undefined
        }
        let allergiesDisplay = [];

        if (allergiesSearchSet.entry === undefined) {
            return undefined;
        }

        if (allergiesSearchSet.entry.length === 0) {
            return undefined;
        }

        // Check if the conditionsSearchSet is iterable
        if (!allergiesSearchSet.entry[Symbol.iterator]) {
            return undefined;
        }

        for (let allergy of allergiesSearchSet.entry) {
            Logger.logInfo('AllergiesProvider.ts', 'getAllergiesByPatientIdentifier', `Allergy: ${allergy.resource.code.coding[0].display}`);
            allergiesDisplay.push({
                "type": allergy.resource.type ? allergy.resource.type : "allergy",
                "causalAgent": allergy.resource.code.coding[0].display
            });
        }

        return allergiesDisplay;
    }
}