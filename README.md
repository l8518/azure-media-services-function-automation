
# azure-media-services-function-automation
Azure Media Services Automation with Azure Functions that automatically encodes video files.

[![Build Status](https://dev.azure.com/l8518/azure-media-services-function-automation/_apis/build/status/l8518.azure-media-services-function-automation?branchName=master)](https://dev.azure.com/l8518/azure-media-services-function-automation/_build/latest?definitionId=1&branchName=master)

# Setup
## Create a Service Principal
Follow these steps to create an application in your Azure subscription:
1. Via the Azure Portal or Azure CLI create an App Registration, write down:
    - Application (client) ID
    - Directory (tenant) ID

2. Add a new client secret to the just created application, write down:
    -  client secret value

3. Open the managed application, not the app registration, write down:
    - Object ID

## Deploy the given ARM script
[![Deploy to Azure](https://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

## Deploy Azure Function App Functions

Either use the github release, or build your own.

### Install (optional)

You might need to install the Azure Functions Core Tools and the Azure Functions Extensions for VS Code.
If you do not want to deploy via VS Code, just create a zip file of the dist folder and upload it.

- `cd az-function-app` and use `npm install` to install relevant packages.

- `npm run build:production` for a production build, then zip dist file and 

## Create the Event Subscriptions Manually

1. Create a Event Subscription from the solution storage account, with the following specifics:
- Trigger Function (use the Azure Portal Function App Template): `EncodeBlob`
- Only for event type: `Blob Created` and `EventGridSchema`
- Add filter:
    - key: `subject`
    - operator: `String begins with`
    - value: `/blobServices/default/containers/filein`

Now uploaded files will be automatically encoded with the Azure Media Services.

2. Create an Event Subscription from the Azure Media Service, with the following specifics:
- Trigger Function (use the Azure Portal Function App Template): `JobFinishedTrigger`
- Only for event type: `Job finished` and `EventGridSchema`

3. Create a Rule under Lifecycle Management to keep AMS Storage clean (and safe consumption):
- Action Set: Select delete blob with desired amount of days till deletion (BUT: you could also move to archive storage)
