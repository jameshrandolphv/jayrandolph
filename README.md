# Jay Randolph

Personal website styled as a Mac OS X Aqua / Frutiger Aero desktop. Built with Angular.

## Structure

- Desktop at `/` with a Pictures folder and the Film Sim app.
- Apps are registered in `src/app/os/apps.ts`; folders come from the filesystem service in `src/app/os/filesystem.service.ts`.
- Film Sim (`/film-sim`) is a Rust/WebAssembly film simulator (see `engine/`).

## Photographs

Photos are hosted in a private S3 bucket and listed by a Lambda in [jayrandolph-service](https://github.com/jameshrandolphv/jayrandolph-service), which returns album/photo metadata and presigned URLs for each thumbnail and original. `FileSystemService` loads `GET <photosApiUrl>/albums` at startup and reloads it halfway through the URL lifetime.

Set `photosApiUrl` (the stack's `ApiUrl` output) in `src/environments/environment.ts` for `npm start` and `src/environments/environment.prod.ts` for production builds. While it is empty the Pictures folder is empty. The API must allow this site's origin (the service's CDK `origins` context).

Originals still live in `photos-src/`, in any folder structure; upload them with the service's `scripts/upload-photos.mjs` (see its README). Each album carries its folder `path`, and `FileSystemService` rebuilds that folder tree under Pictures, so nested folders open as nested windows.

## Commands

```bash
npm start              # dev server at http://localhost:4200/
npm run build          # production build in dist/jay-randolph/browser
npm test               # unit tests (Vitest)
npm run engine:build   # rebuild public/engine/film_engine.wasm (needs Rust); the binary is committed
```

## Hosting (AWS Amplify)

`amplify.yml` builds the site. In the Amplify console add a rewrite under Hosting > Rewrites and redirects so deep links work:

| Source | Target | Type |
| --- | --- | --- |
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp\|wasm\|avif\|fsp)$)([^.]+$)/>` | `/index.html` | 200 (Rewrite) |

# Backend Setup

## 1. Install the tools

```bash
brew install awscli
aws --version
```

Node.js 18+ is also required (already installed).

## 2. Create AWS credentials

1. Sign in at https://console.aws.amazon.com.
2. Go to **IAM → Users → Create user** (for example `cdk-deployer`).
3. Attach the **AdministratorAccess** policy. CDK creates IAM roles, so a narrower policy is fiddly. Use a dedicated user and delete or deactivate it when you're done.
4. Open the user, then **Security credentials → Create access key → Command Line Interface**, and save the key and secret.

## 3. Configure the CLI

```bash
aws configure
# AWS Access Key ID:     <key>
# AWS Secret Access Key: <secret>
# Default region name:   us-east-1
# Default output format: json

aws sts get-caller-identity   # should print your account ID
```

CDK deploys to the region configured here (it falls back to `us-east-1`).

## 4. Install dependencies and bootstrap

```bash
cd ../jayrandolph-service/infra
npm install
npx cdk bootstrap        # once per AWS account and region
```

If `npm install` fails with `EACCES` on `~/.npm`, either run `sudo chown -R 501:20 ~/.npm` once, or add `--cache /tmp/npm-cache` to the install command.

## 5. Deploy the dev stack

```bash
npx cdk deploy -c stage=dev
```

Type `y` when asked about IAM changes. The deploy prints two outputs:

```
PhotographyStackDev.ApiUrl = https://abc123.execute-api.us-east-1.amazonaws.com
PhotographyStackDev.PhotosBucketName = photographystackdev-photosbucket2ac9d1f0-xxxx
```

To see them again later:

```bash
aws cloudformation describe-stacks --stack-name PhotographyStackDev --query "Stacks[0].Outputs"
```

The dev stack only allows CORS from `http://localhost:4200`.

## 6. Deploy the prod stack

Pass the exact origin(s) of the live site: `https://`, no trailing slash. For Amplify it looks like `https://main.xxxx.amplifyapp.com`, plus your custom domain if you have one. Separate multiple origins with commas.

```bash
npx cdk deploy -c stage=prod -c origins=https://main.xxxx.amplifyapp.com,https://yourdomain.com
```

Prod is a separate stack (`PhotographyStackProd`) with its own bucket and API URL. The prod stack refuses to synthesize without `origins`.

## 7. Upload photos

Run this from the service repo with the same AWS credentials still configured.

```bash
cd ../jayrandolph-service/scripts
npm install                       # first time only (add --cache /tmp/npm-cache if EACCES)

# Check what would happen (still needs working AWS credentials)
node upload-photos.mjs ../../jay-randolph/photos-src --bucket <PhotosBucketName> --dry-run

# Upload
node upload-photos.mjs ../../jay-randolph/photos-src --bucket <PhotosBucketName>
```

- The path is the folder that contains one subfolder per album, with the images inside (jpg, jpeg, png, webp, avif).
- Use the bucket name from the dev stack for dev and from the prod stack for prod.
- You can set the bucket once with `export PHOTOS_BUCKET=<name>` instead of passing `--bucket`.
- An optional `album.json` containing `{ "title": "…" }` in an album folder sets the album title. Any other fields in it are returned to the site as album metadata.
- The script generates a thumbnail for each photo and uploads originals with their width and height as S3 metadata. Re-running is safe: originals already uploaded with the same size are skipped.
- Files whose name starts with `private-` (case-insensitive) are never listed or presigned by the Lambda, although the script still uploads them to the bucket.
- To remove an album, delete its keys: `aws s3 rm s3://<bucket>/albums/<album-id>/ --recursive`.
- If you later switch to a narrower IAM user, it needs `s3:PutObject`, `s3:GetObject` and `s3:ListBucket` on the bucket.

## 8. Verify

```bash
curl -s https://abc123.execute-api.us-east-1.amazonaws.com/albums | head -c 600
```

You should see JSON with albums and presigned `thumb` and `src` URLs. `{"albums": [], ...}` means nothing is uploaded yet, or every photo is missing its thumbnail or dimensions (the Lambda logs a warning for those in CloudWatch).

## 9. Connect the site

Put the API URLs in this repo:

- `src/environments/environment.ts` (used by `npm start`): the dev `ApiUrl`.
- `src/environments/environment.prod.ts` (production build): the prod `ApiUrl`.

Then run `npm start` and open http://localhost:4200. The desktop appears immediately and the Pictures window shows a loader until the album list arrives. Commit and push to deploy the site through Amplify.

## Troubleshooting

- **Photos don't load in prod, CORS error in the browser console:** the `origins` passed at deploy time must exactly match the site's origin. Redeploy with the corrected value.
- **Pictures folder is empty:** `photosApiUrl` is empty or the API is unreachable (the site then shows an empty library), or the bucket has no complete photos. Check with the `curl` above.
- **Images stop loading after a long session:** the presigned URLs last 1 hour. The site reloads the list at half that lifetime, so this should not happen; if it does, reload the page.
- **Changing the Lambda or infrastructure:** redeploy with the same `cdk deploy -c stage=…` command.
- **Replacing the old stack:** deploying replaces the earlier Aurora/VPC-based stack. The prod database was set to retain, so delete it by hand if you no longer need it.
- **Tearing down dev:** `npx cdk destroy -c stage=dev` (the dev bucket and its contents are deleted). The prod bucket is retained.
