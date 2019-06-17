import { AzureFunction, Context } from "@azure/functions"
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { AzureMediaServices, AzureMediaServicesModels} from "@azure/arm-mediaservices";
import { Transform, Job, Asset, TransformsGetResponse, AssetsCreateOrUpdateResponse } from "@azure/arm-mediaservices/esm/models";
import { createSASQueryParameters } from "../lib/utils";
import { SharedKeyCredential, BlobURL, StorageURL, Aborter} from "@azure/storage-blob"

const uuidv4 = require('uuid/v4');
const ENCODING_TRANSFORM_DEFAULT_NAME = process.env["AMS_ENCODING_PRESET"] || "DefaultDeployedEncodingPreset";
const SUBSCRIPTION_ID = process.env["SUBSCRIPTION_ID"];
const AAD_CLIENT_ID = process.env["AAD_CLIENT_ID"];
const AAD_SECRET = process.env["AAD_SECRET"];
const AAD_TENANT_ID = process.env["AAD_TENANT_ID"];
const AMS_RESOURCE_GROUP = process.env["AMS_RESOURCE_GROUP"];
const AMS_STORAGE_ACC_NAME = process.env["AMS_STORAGE_ACC_NAME"];
const STORAGE_ACC_NAME = process.env["STORAGE_ACC_NAME"];
const STORAGE_KEY = process.env["STORAGE_KEY"];

/**
 * This AZ Function triggers the Azure Media Service to encode a uploaded file automatically.
 * @param context 
 * @param eventGridEvent 
 */
const eventGridTrigger: AzureFunction = async function (context: Context, eventGridEvent: any): Promise<void> {
    if (eventGridEvent.eventType != "Microsoft.Storage.BlobCreated") {
        context.res = {
            status: 400,
            body: "EventGridEvent does not match Microsoft.Storage.BlobCreated."
        };
        return;
    }

    // Construct input params
    let uniqueness = uuidv4();
    let outputAssetName = 'encoding-output-' + uniqueness;
    let fileInputUrl : string = eventGridEvent.data.url;

    const storageSharedKeyCredential = new SharedKeyCredential(STORAGE_ACC_NAME, STORAGE_KEY);
    const storagePipeline = StorageURL.newPipeline(storageSharedKeyCredential);
    const blob = new BlobURL(fileInputUrl, storagePipeline)
    const blobProperties = await blob.getProperties(Aborter.none, {});
    const createdAt = blobProperties.creationTime;
    let uriComponents = fileInputUrl.split("/");
    const blobName = uriComponents.pop();
    const jobLabel = `${blobName}-${createdAt.toISOString()}`
    let storageSASParams = getSASString(storageSharedKeyCredential);
    let sourceURIWithSAS = `${fileInputUrl}?${storageSASParams}`;
    
    let jobInputParam: AzureMediaServicesModels.JobInputUnion = {
        odatatype: "#Microsoft.Media.JobInputHttp",
        files: [sourceURIWithSAS]
    }
    let jobName = 'encoding-job-' + uniqueness;

    // Connect to AMS and submit job
    const creds = await msRestNodeAuth.loginWithServicePrincipalSecret(AAD_CLIENT_ID, AAD_SECRET, AAD_TENANT_ID);
    const client = new AzureMediaServices(creds, SUBSCRIPTION_ID);
    let transform = await getTransform(client, AMS_RESOURCE_GROUP, AMS_STORAGE_ACC_NAME, ENCODING_TRANSFORM_DEFAULT_NAME)
    let outputAsset = await createOutputAsset(client, AMS_RESOURCE_GROUP, AMS_STORAGE_ACC_NAME, outputAssetName)
    await createJob(client, jobName, AMS_RESOURCE_GROUP, AMS_STORAGE_ACC_NAME, transform.name, outputAsset, jobLabel, jobInputParam);
    context.done();
};

function getSASString(amsStorageSharedKeyCredential:SharedKeyCredential) {
    // Connnect to Primary Storage of Azure Media Service 
    // Use SharedKeyCredential with storage account and account key
    // Get a SAS Token to grant public access for required operations
    const amsStorageSASParamsString = createSASQueryParameters(amsStorageSharedKeyCredential).toString();
    return amsStorageSASParamsString
}

/**
 * Returns the default transform for azure media services
 * @param client 
 * @param resourceGroupName 
 * @param accountName 
 * @param encodingTransformName 
 * @param encodingTransformPreset 
 */
async function getTransform(client: AzureMediaServices, resourceGroupName: string, accountName: string, encodingTransformName: string): Promise<Transform> {
    let transform: TransformsGetResponse = await client.transforms.get(resourceGroupName, accountName, encodingTransformName);
    return transform;
}

/**
 * Creates the Job for Azure Media Services
 * @param client 
 * @param resourceGroupName 
 * @param accountName 
 * @param encodingTransformName 
 * @param outputAsset 
 */
async function createJob(client: AzureMediaServices, jobName: string, resourceGroupName: string, accountName: string, encodingTransformName: string, outputAsset: Asset, label : string , inputParam: AzureMediaServicesModels.JobInputUnion): Promise<Job> {
    let jobOutputs: AzureMediaServicesModels.JobOutputUnion[] = [
        {
            odatatype: "#Microsoft.Media.JobOutputAsset",
            label: label,
            assetName: outputAsset.name,
        }
    ];

    return await client.jobs.create(resourceGroupName, accountName, encodingTransformName, jobName, {
        input: inputParam,
        outputs: jobOutputs,
    });
}

/**
 * Creates an output asset on the Azure Media Service for the encoding job.
 * @param client 
 * @param resourceGroupName 
 * @param accountName 
 * @param assetName 
 */
async function createOutputAsset(client: AzureMediaServices, resourceGroupName: string, accountName: string, assetName: string): Promise<AssetsCreateOrUpdateResponse> {
    return await client.assets.createOrUpdate(resourceGroupName, accountName, assetName, {});
}

export default eventGridTrigger;
