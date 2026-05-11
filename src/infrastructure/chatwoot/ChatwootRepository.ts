import type { CatalogRepository } from "@/application/dashboard";
import { chatwootClient } from "./ChatwootClient";
import { dedupeContactAttributeDefinitions } from "./ContactAttributeDefinitionMapper";

export const chatwootRepository: CatalogRepository = {
    fetchInboxes: (signal) => chatwootClient.getInboxes({ signal }),
    fetchLabels: (signal) => chatwootClient.getLabels({ signal }),
    fetchContactAttributeDefinitions: async (signal) =>
        dedupeContactAttributeDefinitions(await chatwootClient.getAttributeDefinitions({ signal })),
};
