import { AzureFunction, Context } from "@azure/functions"
import { ContainerURL, SharedKeyCredential, Aborter, StorageURL, ServiceURL, BlobURL} from "@azure/storage-blob"
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { AzureMediaServices, AzureMediaServicesModels, AzureMediaServicesMappers, Assets } from "@azure/arm-mediaservices";
import { createSASQueryParameters } from "../lib/utils";

const AMS_STORAGE_ACC_NAME = process.env["AMS_STORAGE_ACC_NAME"];
const AMS_STORAGE_KEY = process.env["AMS_STORAGE_KEY"];
const STORAGE_ACC_NAME = process.env["STORAGE_ACC_NAME"];
const STORAGE_KEY = process.env["STORAGE_KEY"];
const STORAGE_TARGET_CONTAINER = process.env["STORAGE_TARGET_CONTAINER"];
const SUBSCRIPTION_ID = process.env["SUBSCRIPTION_ID"];
const AAD_CLIENT_ID = process.env["AAD_CLIENT_ID"];
const AAD_SECRET = process.env["AAD_SECRET"];
const AAD_TENANT_ID = process.env["AAD_TENANT_ID"];
const AMS_RESOURCE_GROUP = process.env["AMS_RESOURCE_GROUP"];

const eventGridTrigger: AzureFunction = async function (context: Context, eventGridEvent: any): Promise<void> {
    context.log(eventGridEvent.data.outputs);
    if (eventGridEvent.eventType != "Microsoft.Media.JobFinished") {
        context.res = {
            status: 400,
            body: "EventGridEvent does not match Microsoft.Media.JobFinished."
        };
        return;
    }
    let assetName = getAssetName(eventGridEvent);
    let jobLabel =  getAssetLabel(eventGridEvent);

    // Connect to Azure Media Service
    const amsClientCredentials = await msRestNodeAuth.loginWithServicePrincipalSecret(AAD_CLIENT_ID, AAD_SECRET, AAD_TENANT_ID);
    const amsClient = new AzureMediaServices(amsClientCredentials, SUBSCRIPTION_ID);

    // Connnect to Primary Storage of Azure Media Service 
    // Use SharedKeyCredential with storage account and account key
    const amsStorageSharedKeyCredential = new SharedKeyCredential(AMS_STORAGE_ACC_NAME, AMS_STORAGE_KEY);
    // Get a SAS Token to grant public access for required operations
    const amsStorageSASParamsString = createSASQueryParameters(amsStorageSharedKeyCredential).toString();
    const amsStoragePipeline = StorageURL.newPipeline(amsStorageSharedKeyCredential);
    const amsStorageServiceURL = new ServiceURL(`https://${AMS_STORAGE_ACC_NAME}.blob.core.windows.net`, amsStoragePipeline);

    // Auth wit target storage
    const storageSharedKeyCredential = new SharedKeyCredential(STORAGE_ACC_NAME, STORAGE_KEY);
    const storagePipeline = StorageURL.newPipeline(storageSharedKeyCredential);
    const storageServiceURL = new ServiceURL(`https://${STORAGE_ACC_NAME}.blob.core.windows.net`, storagePipeline);
    const targetBlobContainer = ContainerURL.fromServiceURL(storageServiceURL, STORAGE_TARGET_CONTAINER);

    let blobArray = await getJobResultBlobArray(amsClient, amsStorageServiceURL, amsStorageSASParamsString, assetName);
   
    blobArray.forEach((elem : any, idx, arr) => {
        let blobURI = targetBlobContainer.url + "/" + jobLabel + "/" + elem.name;
        let blob = new BlobURL(blobURI, storagePipeline)
        blob.startCopyFromURL(Aborter.none, elem.sourceURIWithSAS, {})
    })
};

function getAssetName(eventGridEvent): string {
    if (eventGridEvent.data.outputs.length != 1) {
        throw "Undefined state!"
    } else {
        return eventGridEvent.data.outputs[0].assetName
    }
}

function getAssetLabel(eventGridEvent): string {
    if (eventGridEvent.data.outputs.length != 1) {
        throw "Undefined state!"
    } else {
        return eventGridEvent.data.outputs[0].label
    }
}

async function getJobResultBlobArray(client: AzureMediaServices, serviceURL: ServiceURL, SASParamsString: string, assetName: string) {
    // get container name:
    let jobAsset = await client.assets.get(AMS_RESOURCE_GROUP, AMS_STORAGE_ACC_NAME, assetName);
    let containerName = jobAsset.container;
    const sourceBlobContainer = ContainerURL.fromServiceURL(serviceURL, containerName);

    let blobsArr = await getBlobs(sourceBlobContainer);
    let blobWithSASArr: Object[] = [];
    blobsArr.forEach((elem, idx, arr) => {
        let sourceURI = sourceBlobContainer.url + "/" + elem.name;
        let sourceURIWithSAS = `${sourceURI}?${SASParamsString}`
        blobWithSASArr.push({
            name: elem.name,
            sourceURIWithSAS: sourceURIWithSAS
        });
    })
    return blobWithSASArr;
}

async function getBlobs(containerURL: ContainerURL) {
    // Container exists, let's get the specific blobs
    let blobArr = [];
    let blobMarker;
    // List all the blobs:
    do {
        let blobResp = await containerURL.listBlobFlatSegment(Aborter.none, blobMarker, {});
        blobMarker = blobResp.nextMarker;
        if (blobResp.segment.blobItems) {
            blobResp.segment.blobItems.forEach((elem, idx, arr) => {
                blobArr.push(elem);
            })
        }
    } while (blobMarker);
    return blobArr;
}

export default eventGridTrigger;
