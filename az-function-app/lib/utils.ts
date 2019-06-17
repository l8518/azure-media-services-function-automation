import { generateAccountSASQueryParameters, SASQueryParameters, AccountSASPermissions, AccountSASResourceTypes, AccountSASServices } from "@azure/storage-blob"

export function createSASQueryParameters(sharedKeyCredential) : SASQueryParameters {
    var startDate = new Date();
    var expiryDate = new Date(startDate);
    expiryDate.setMinutes(startDate.getMinutes() + 100);
    startDate.setMinutes(startDate.getMinutes() - 100);

    let accSASPermission = new AccountSASPermissions()
    accSASPermission.read = true;

    let accSASService = new AccountSASServices()
    accSASService.blob = true

    let accSASResourceType = new AccountSASResourceTypes();
    accSASResourceType.object = true;

    let accSASSignatureValues = {
        expiryTime: expiryDate,
        permissions: "r",
        // protocol: SASProtocol.HTTPS,
        resourceTypes: "o",
        services: "b",
        startTime: startDate
    }

    let queryParams = generateAccountSASQueryParameters(accSASSignatureValues, sharedKeyCredential)
    return queryParams;
}