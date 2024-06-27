import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

interface AppSettings {
  Environments: EnvironmentSettings[]
}

interface EnvironmentSettings {
  Name: string
  Production: boolean
  Tenant: string
  PolicySettings: Record<string, string>
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Fetch our input variables
    const env = core.getInput('environment')
    const inputFolder = core.getInput('inputFolder')
    const outputFolder = core.getInput('outputFolder')

    if (
      env === undefined ||
      inputFolder === undefined ||
      outputFolder === undefined
    ) {
      core.setFailed('A parameter is missing')
      return
    }

    if (!env || !inputFolder || !outputFolder) {
      core.setFailed('A parameter is missing')
      return
    }

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true })
    }

    const settings = JSON.parse(
      fs.readFileSync(path.join(inputFolder, 'appsettings.json'), 'utf-8')
    ) as AppSettings

    if (!settings) {
      core.setFailed('Unable to read appsettings.json in input folder')
      return
    }

    if (!settings.Environments || settings.Environments.length === 0) {
      core.setFailed('No Environments specified in appsettings.json')
      return
    }

    const envSettings = settings.Environments.find(s => s && s.Name === env)
    if (!envSettings) {
      core.setFailed(
        `Environment "${env}" was not found in Environments of appsettings.json`
      )
      return
    }

    if (!envSettings.Tenant) {
      core.setFailed('Tenant not set in appsettings.json for environment')
      return
    }

    // Override/add settings from additional arguments
    // envSettings.PolicySettings ??= {};
    // for (const additionalArgument of additionalArguments) {
    //   envSettings.PolicySettings[additionalArgument.key] = additionalArgument.value;
    // }

    const policyFiles = fs
      .readdirSync(inputFolder)
      .filter(f => f.endsWith('.xml'))
    core.debug(`${policyFiles.length} XML files found in input folder`)

    if (policyFiles.length === 0) {
      core.setFailed('No XML files found in input folder')
      return
    }

    for (const policyFile of policyFiles) {
      core.debug(`Replacing placeholders in ${policyFile}`)
      let fileContent = fs.readFileSync(
        path.join(inputFolder, policyFile),
        'utf-8'
      )
      // Tenant is a special setting
      core.debug(`Replacing {Settings:Tenant} with ${envSettings.Tenant}`)
      fileContent = fileContent.replace(
        /{Settings:Tenant}/g,
        envSettings.Tenant
      )

      // Go through and replace all of the other settings
      for (const policySettingKey of Object.keys(
        envSettings.PolicySettings ?? {}
      )) {
        core.debug(
          `Replacing {Settings:${policySettingKey}} with ${envSettings.PolicySettings[policySettingKey]}`
        )
        fileContent = fileContent.replace(
          new RegExp(`{Settings:${policySettingKey}}`, 'g'),
          envSettings.PolicySettings[policySettingKey]
        )
      }

      // Write final version to output
      const outputFile = path.join(outputFolder, policyFile)
      core.debug(`Writing policy file ${outputFile}`)
      fs.writeFileSync(outputFile, fileContent)
    }

    console.log(`Wrote ${policyFiles.length} policies to output folder`)
    core.setOutput('result', 'success')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
