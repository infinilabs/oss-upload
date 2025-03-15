import * as core from '@actions/core'
import AliyunOSS from 'ali-oss'
import { glob } from 'glob'
import * as path from 'path' // 使用 path.posix

async function run(): Promise<void> {
  try {
    const REGION = core.getInput('region', { required: true });
    const ACCESS_KEY_ID = core.getInput('access-key-id', { required: true })
    const ACCESS_KEY_SECRET = core.getInput('access-key-secret', { required: true })
    const BUCKET = core.getInput('bucket', { required: true })
    const SECURE = core.getInput('secure')
    const LOCAL_FOLDER = core.getInput('local-folder', { required: true })
    const FILE_PATTERN = core.getInput('file-pattern') || '*'
    const REMOTE_DIR: string = core.getInput('remote-dir', { required: true })
    
    const client = new AliyunOSS({
      region: REGION,
      accessKeyId: ACCESS_KEY_ID,
      accessKeySecret: ACCESS_KEY_SECRET,
      secure: /^\s*(true|1)\s*$/i.test(SECURE),
      bucket: BUCKET
    })

    // 规范化 local-folder
    let folder = LOCAL_FOLDER
    while (folder.startsWith('/')) {
      folder = folder.slice(1)
    }
    while (folder.endsWith('/')) {
      folder = folder.slice(0, folder.length - 1)
    }
    if (folder.length === 0) {
      core.setFailed('local-folder is empty')
      return
    }

    // 规范化 remote-dir，确保以 / 结尾 (除非是根目录)
    let remoteDir = REMOTE_DIR
    while (remoteDir.startsWith('/')) {
      remoteDir = remoteDir.slice(1)
    }
    if (remoteDir.length > 0 && !remoteDir.endsWith('/')) {
      remoteDir += '/'
    }

    const maxConcurrency = 10
    // --- ADDED LOGGING HERE ---
    console.log(`Local folder: ${folder}`);
    console.log(`File pattern: ${FILE_PATTERN}`);
    const files: string[] = glob.sync(`${folder}/${FILE_PATTERN}`, { nodir: true });
    console.log(`Found files: ${JSON.stringify(files, null, 2)}`); // Log the found files
    // --- END ADDED LOGGING ---

    // 使用 Promise.allSettled 避免一个文件上传失败导致整个进程失败
    const results = await Promise.allSettled(
      Array.from(
        { length: maxConcurrency },
        async (_, index): Promise<number> => {
          return new Promise<number>((resolve) => {
            const proc = async (): Promise<void> => {
              const file = files.shift()
              if (file === undefined) {
                resolve(index)
                return
              }
              try {
                const ossFilePath = path.posix.join(
                  remoteDir,
                  path.relative(folder, file)
                )
                await client.put(ossFilePath, file)
                core.info(`Uploaded: ${file} to ${ossFilePath}`)
              } catch (error) {
                // 捕获单个文件上传的错误，但不中断整个过程
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

    // 检查是否有失败的上传
    const failedCount = results.filter(
      (result) => result.status === 'rejected'
    ).length
    if (failedCount > 0) {
      core.setFailed(`${failedCount} files failed to upload.`)
    } else {
      core.setOutput('upload-status', 'success')
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}
run()
