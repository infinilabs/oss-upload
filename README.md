<!-- <p align="center">
  <a href="https://github.com/actions/typescript-action/actions"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>
</p> -->

# OSS Upload

OSS Upload for files upload to Aliyun OSS when use GitHub Actions

## Usage

```yaml
steps:
- uses: actions/checkout@master
- uses: infinilabs/oss-upload@v0
    with:
      # aliyun config
      region: oss-cn-beijing
      access-key-id: ${{ secrets.ACCESS_KEY_ID }}
      access-key-secret: ${{ secrets.ACCESS_KEY_SECRET }}
      bucket: ${{ secrets.BUCKET }}
      secure: true
      # deploy config
      local-folder: dist
      file-pattern: '*.zip'
      remote-dir: /
```

## Arguments

This action supports eight inputs from the user, most of which are required:
`region`, `access-key-id`, `access-key-secret`, `bucket`, `secure`, `entry`,
`remote-dir`, `file-pattern`,`path-rewrite`. Their descriptions and default
values are listed below:

| Input             | Description                                                                       | Usage    | default |
| ----------------- | --------------------------------------------------------------------------------- | -------- | ------- |
| region            | The bucket data region location                                                   | Required |         |
| access-key-id     | Access key you create on aliyun console website                                   | Required |         |
| access-key-secret | Access secret you create                                                          | Required |         |
| bucket            | The default bucket you want to access If you don't have any bucket, please create | Required |         |
| secure            | Instruct OSS client to use HTTPS (secure: true) or HTTP (secure: false) protocol  | Optional | true    |
| local-folder      | You need to upload files of this folder to OSS ,RECURSIVE alse,like `dist/html`   |          |         |
| file-pattern      | File pattern to filter files (e.g., _.zip, _.tar.gz)                              | Optional | \*      |
| remote-dir        | Directory path transferred to OSS                                                 | Optional | \\      |

## Example

```yaml
name: Example workflow for OSS Upload to Aliyun
on: [push]
jobs:
  Release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js latest
        uses: actions/setup-node@v1
        with:
          node-version: 'latest'

      - name: Build Project
        run: npm install && npm run build

      - name: Deploy to Aliyun OSS
        uses: infinilabs/oss-upload@v0
        with:
          # aliyun config
          region: oss-cn-shanghai
          access-key-id: ${{ secrets.ACCESS_KEY_ID }}
          access-key-secret: ${{ secrets.ACCESS_KEY_SECRET }}
          bucket: ${{ secrets.BUCKET }}
          secure: true
          # deploy config
          local-folder: dist
          file-pattern: '{*.zip,*.tar.gz}'
          remote-dir: /
```
