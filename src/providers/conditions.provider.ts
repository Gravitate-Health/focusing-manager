import { Logger } from "../utils/Logger";

export class ConditionsProvider {
    baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    async getConditionsByPatientIdentifier(patientIdentifier: string) {
        let baseUrl = `${this.baseUrl}/Condition?patient.identifier=${patientIdentifier}`;
        let conditionsSearchSet;
        try {
            Logger.logInfo('ConditionsProvider.ts', 'getConditionsByPatientIdentifier', 'Getting conditions by patient identifier');

            const response = await fetch(baseUrl)
    
            conditionsSearchSet = await response.json();
        } catch (error) {
            return undefined
        }
        let conditionsDisplay = [];
        console.log(conditionsSearchSet);

        if (conditionsSearchSet.entry === undefined) {
            return undefined;
        }

        for (let condition of conditionsSearchSet.entry) {
            Logger.logInfo('ConditionsProvider.ts', 'getConditionsByPatientIdentifier', `Condition: ${condition.resource.code.coding[0].display}`);
            conditionsDisplay.push(condition.resource.code.coding[0].display);
        }

        return conditionsDisplay;
    }
}