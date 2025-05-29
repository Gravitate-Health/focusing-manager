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

        if (conditionsSearchSet.entry.length === 0) {
            return undefined;
        }

        // Check if the conditionsSearchSet is iterable
        if (!conditionsSearchSet.entry[Symbol.iterator]) {
            return undefined;
        }

        for (let condition of conditionsSearchSet.entry) {
            if (condition.resource.code.coding[0].display === undefined) {
                continue;
            }
            if (condition.resource.code.coding[0].display === '') {
                continue;
            }
            
            Logger.logInfo('ConditionsProvider.ts', 'getConditionsByPatientIdentifier', `Condition: ${condition.resource.code.coding[0].display}`);
            // Push the condition display to the conditionsDisplay array but remove the text in parentheses if it exists
            let conditionDisplay = condition.resource.code.coding[0].display;
            const match = conditionDisplay.match(/\(([^)]+)\)/);
            if (match) {
                conditionDisplay = conditionDisplay.replace(match[0], '').trim();
            }
            conditionsDisplay.push(conditionDisplay);
        }

        return conditionsDisplay;
    }
}