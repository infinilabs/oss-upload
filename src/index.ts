import * as core from '@actions/core'
import AliyunOSS from 'ali-oss'
import { glob } from 'glob'
import * as path from 'path'
import * as fs from 'fs'
import JSZip from 'jszip'

// --- Debug Logging Function ---
function debugLog(message: string): void {
  const debugMode = core.getInput('debug')
  if (/^\s*(true|1)\s*$/i.test(debugMode)) {
    console.log(message)
  }
}

/**
 * Repacks (renames and zips) files based on a provided version string and a file mapping.
 * @param folder The base folder containing the files.
 * @param filePattern The glob pattern to match files.
 * @param version The version string (format: x.y.z-w).
 * @returns A Promise that resolves to an array of the *new* file paths (zipped files).  Or rejects on error.
 */
async function repackFiles(
  folder: string,
  filePattern: string,
  version: string
): Promise<string[]> {
  debugLog(`Repacking files using version: ${version}`)

  const versionRegex = /^(\d+)\.(\d+)\.(\d+)(?:-(.*))?$/
  const match = version.match(versionRegex)

  if (!match) {
    throw new Error(`Invalid version format: ${version}.  Expected x.y.z-w`)
  }

  const major = match[1]
  const minor = match[2]
  const patch = match[3]
  const suffix = match[4] || ''

  const fileMap: { [key: string]: string } = {
    'x86-setup.exe': 'windows-386.exe',
    'x64-setup.exe': 'windows-amd64.exe',
    'arm64-setup.exe': 'windows-arm64.exe',
    'x64.dmg': 'mac-amd64.dmg',
    'aarch64.dmg': 'mac-arm64.dmg',
    'amd64.deb': 'deb-linux-amd64.deb',
    'arm64.deb': 'deb-linux-arm64.deb',
    '-1.x86_64.rpm': 'rpm-linux-amd64.rpm',
    '-1.aarch64.rpm': 'rpm-linux-arm64.rpm'
  }

  const filesToRepack: string[] = glob.sync(`${folder}/${filePattern}`, {
    nodir: true
  })
  const repackedFiles: string[] = []

  for (const oldFilePath of filesToRepack) {
    const baseName = path.basename(oldFilePath)
    const ext = path.extname(baseName)
    const fileNameWithoutExt = path.basename(oldFilePath, ext)
    let matched = false

    for (const pattern in fileMap) {
      const regex = new RegExp(
        pattern.replace(/\./g, '\\.').replace(/-/g, '[-_]*'),
        'i'
      )
      if (regex.test(baseName)) {
        const newSuffixWithExt = fileMap[pattern]
        const newSuffix = path.basename(newSuffixWithExt, ext)

        const originalPrefixRegex = /^(.*?)[-_]*\d+\.\d+\.\d+.*[-_]/
        const prefixMatch = fileNameWithoutExt.match(originalPrefixRegex)
        const originalPrefix = prefixMatch
          ? prefixMatch[1]
          : fileNameWithoutExt.split('_')[0]

        // Construct the *complete* new base name:  prefix + version + suffix
        const newBaseName = `${originalPrefix}-${major}.${minor}.${patch}${suffix ? `-${suffix}` : ''}-${newSuffix}`
        const newNameWithExt = `${newBaseName}${ext}`
        const newFilePath = path.join(path.dirname(oldFilePath), newNameWithExt)

        try {
          // Rename
          fs.renameSync(oldFilePath, newFilePath)
          debugLog(`Renamed: ${oldFilePath} to ${newFilePath}`)

          // Zip
          const zip = new JSZip()
          zip.file(newNameWithExt, fs.readFileSync(newFilePath))
          const zipContent = await zip.generateAsync({ type: 'nodebuffer' })
          const zipFilePath = path.join(
            path.dirname(oldFilePath),
            `${newBaseName}.zip`
          )
          fs.writeFileSync(zipFilePath, zipContent)
          debugLog(`Zipped: ${newFilePath} to ${zipFilePath}`)

          repackedFiles.push(zipFilePath)
          matched = true
          break
        } catch (error: any) {
          throw new Error(`Error processing ${oldFilePath}: ${error.message}`)
        }
      }
    }
    if (!matched) {
      console.warn(`Warning: No mapping found for ${oldFilePath}. Skipping.`)
      repackedFiles.push(oldFilePath)
    }
  }
  debugLog('Repacking complete.')
  return repackedFiles
}

async function run(): Promise<void> {
  try {
    const REGION = core.getInput('region', { required: true })
    const ACCESS_KEY_ID = core.getInput('access-key-id', { required: true })
    const ACCESS_KEY_SECRET = core.getInput('access-key-secret', {
      required: true
    })
    const BUCKET = core.getInput('bucket', { required: true })
    const SECURE = core.getInput('secure')
    const LOCAL_FOLDER = core.getInput('local-folder')
    const REMOTE_DIR: string = core.getInput('remote-dir')
    const FILE_PATTERN = core.getInput('file-pattern') || '*'
    const REPACK_VERSION = core.getInput('repack-version')

    const client = new AliyunOSS({
      region: REGION,
      accessKeyId: ACCESS_KEY_ID,
      accessKeySecret: ACCESS_KEY_SECRET,
      secure: /^\s*(true|1)\s*$/i.test(SECURE),
      bucket: BUCKET,
      timeout: 300000
    })

    let folder = LOCAL_FOLDER
    while (folder.endsWith('/')) {
      folder = folder.slice(0, folder.length - 1)
    }
    if (folder.length === 0) {
      core.setFailed('local-folder is empty')
      return
    }

    let remoteDir = REMOTE_DIR
    while (remoteDir.startsWith('/')) {
      remoteDir = remoteDir.slice(1)
    }
    if (remoteDir.length > 0 && !remoteDir.endsWith('/')) {
      remoteDir += '/'
    }
    const maxConcurrency = 10

    debugLog(`Local folder: ${folder}`)
    debugLog(`File pattern: ${FILE_PATTERN}`)

    let filesToUpload: string[] = []
    if (REPACK_VERSION) {
      try {
        filesToUpload = await repackFiles(folder, FILE_PATTERN, REPACK_VERSION)
      } catch (error: any) {
        core.setFailed(error.message)
        return
      }
    } else {
      filesToUpload = glob.sync(`${folder}/${FILE_PATTERN}`, { nodir: true })
      debugLog(`Found files: ${JSON.stringify(filesToUpload, null, 2)}`)
    }

    const results = await Promise.allSettled(
      Array.from(
        { length: maxConcurrency },
        async (_, index): Promise<number> => {
          return new Promise<number>((resolve) => {
            const proc = async (): Promise<void> => {
              const file = filesToUpload.shift()
              if (file === undefined) {
                resolve(index)
                return
              }

              try {
                const ossFilePath = path.posix.join(
                  remoteDir,
                  path.basename(file)
                )
                await client.put(ossFilePath, file, {
                  timeout: 300000 
                })
                core.info(`Uploaded: ${file} to ${ossFilePath}`)
              } catch (error) {
                if (error instanceof Error) {
                  core.error(`Failed to upload ${file}: ${error.message}`)
                } else {
                  core.error(`Failed to upload ${file}: ${String(error)}`)
                }
              }
              proc()
            }
            proc()
          })
        }
      )
    )

    const failedCount = results.filter(
      (result) => result.status === 'rejected'
    ).length
    if (failedCount > 0) {
      core.setFailed(`${failedCount} files failed to upload.`)
    } else {
      core.setOutput('upload-status', 'success')
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
    else core.setFailed(String(error))
  }
}

run()
