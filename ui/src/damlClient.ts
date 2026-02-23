import axios from 'axios';

// In a production app, these would be environment variables.
// The Canton React template configures an Envoy proxy, but for our local demo,
// we will point directly to the local HTTP JSON API.
const DAML_JSON_API_URL = 'http://localhost:7575/v1';

// We need an authentication token to interact with the Ledger API.
// In a real app, this is provided by an IAM like Auth0.
// For LocalNet testing, we can often bypass or use a dummy token depending on config.
const defaultHeaders = {
    'Content-Type': 'application/json'
};

/**
 * Creates a generic Axios instance for DAML interactions.
 */
export const damlClient = axios.create({
    baseURL: DAML_JSON_API_URL,
    headers: defaultHeaders
});

/**
 * Fetch all active contracts for a specific template.
 * @param templateId The fully qualified template ID (e.g. 'Main:Invoice')
 * @returns Array of active contracts
 */
export const fetchContracts = async (templateId: string) => {
    try {
        const response = await damlClient.post('/query', {
            templateIds: [templateId]
        });
        return response.data.result;
    } catch (error) {
        console.error(`Error fetching contracts for ${templateId}:`, error);
        throw error;
    }
};

/**
 * Submit a command to create a new contract.
 * @param templateId The fully qualified template ID (e.g. 'Main:InvoiceProposal')
 * @param payload The contract arguments
 */
export const createContract = async (templateId: string, payload: any) => {
    try {
        const response = await damlClient.post('/create', {
            templateId: templateId,
            payload: payload
        });
        return response.data.result;
    } catch (error) {
        console.error(`Error creating contract ${templateId}:`, error);
        throw error;
    }
};

/**
 * Exercise a choice on an existing contract.
 * @param templateId The fully qualified template ID
 * @param contractId The specific contract ID string
 * @param choice The name of the choice to exercise
 * @param argument The arguments for the choice
 */
export const exerciseChoice = async (templateId: string, contractId: string, choice: string, argument: any) => {
    try {
        const response = await damlClient.post('/exercise', {
            templateId: templateId,
            contractId: contractId,
            choice: choice,
            argument: argument
        });
        return response.data.result;
    } catch (error) {
        console.error(`Error exercising choice ${choice} on ${contractId}:`, error);
        throw error;
    }
};
