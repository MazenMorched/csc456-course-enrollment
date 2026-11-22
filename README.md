# Course Enrollment

CSC456 Project 2. An EJS dashboard for managing instructors, courses, students, and course enrollments.

| Action | Administrator | Staff |
| --- | --- | --- |
| View lists and record details | Yes | Yes |
| Create, edit, and delete instructors, courses, and students | Yes | — |
| Reassign courses from the Teaching assignments screen | Yes | — |
| Add and remove enrollments | Yes | Yes |

Public registration creates a staff account. Use synthetic classroom records for the demonstration. An account is separate from a student or instructor record.

## Run from VS Code

1. Extract the ZIP and open the `course-enrollment` folder in VS Code.
2. Install Node.js 22 LTS and open a terminal in that folder.
3. Install dependencies and create your local environment file. In PowerShell:

   ```powershell
   npm ci
   Copy-Item .env.example .env
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

   On macOS or Linux, use `cp .env.example .env` in place of `Copy-Item`.
4. Open `.env` and paste the generated value into `JWT_SECRET`. For the database, either paste an Atlas connection URI into `MONGODB_URI`, with `course_enrollment` as the database name, or use the local Docker option below. Atlas requires a database user and your IP on its access list.
5. Enter `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`. Use at least 12 characters and at most 72 bytes for the password. Then run:

   ```sh
   npm run admin
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) and sign in as the administrator. Use **Register** for a separate staff account.

### Optional local MongoDB with Docker

The app uses transactions for changes that span multiple documents. Start MongoDB as a replica set. With Docker running, use the URI already in `.env.example` and run:

```sh
docker run -d --name course-enrollment-db -p 127.0.0.1:27017:27017 -v course-enrollment-data:/data/db mongo:7.0 --replSet rs0 --bind_ip_all
docker exec course-enrollment-db mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
docker exec course-enrollment-db mongosh --quiet --eval 'db.hello().isWritablePrimary'
```

Run the second line once the database accepts connections. Start the app when the last command reports `true`. For subsequent sessions, start the existing container with `docker start course-enrollment-db`.

## Architecture and data

- `models/` contains Mongoose schemas and constraints. A course stores an instructor reference and an array of student references. One instructor can be assigned to many courses. The same student can be enrolled in many courses.
- `controllers/` handles authentication, record CRUD, and enrollment changes. Transactions guard against a concurrent delete and link operation. Instructors with assigned courses and students with enrollments must first be unlinked. Deleting a course removes its enrollment links.
- `routes/` maps URLs to controllers and enforces access with middleware. `views/` contains EJS page templates and partials for lists, details, creation, editing, deletion, and relationships.
- Passwords are hashed with bcrypt. A signed JWT is stored in an HTTP-only cookie. The server checks the login session and current database role on protected requests. Signing out invalidates that session. Forms carry CSRF tokens, and login attempts are rate-limited.

## Publish with GitHub, Atlas, and Render

1. Create a public GitHub repository. Push the contents of this project folder to its `main` branch. The folder holding `package.json` should be the repository root. Keep `.env` and your filled `submission.txt` private.
2. In [MongoDB Atlas](https://www.mongodb.com/docs/atlas/driver-connection/), create a cluster and a database user scoped to the app database with read/write access. Copy the Node.js driver URI and set its database name to `course_enrollment`. Add your IP for the one-time administrator setup.
3. Create a Render **Web Service** from the GitHub repository. Use the Node runtime, branch `main`, build command `npm ci`, start command `npm start`, and health check path `/health`. Set `NODE_ENV=production`, `NODE_VERSION=22`, `MONGODB_URI`, and a newly generated `JWT_SECRET` in Render. Add the service's [outbound IP ranges](https://render.com/docs/outbound-ip-addresses) to the Atlas IP access list.
4. From your local terminal, temporarily configure `.env` with the Atlas URI and run `npm run admin` to create the administrator in the deployed database. Use a unique email and a password you control.
5. Set Render **Auto-Deploy** to **Off**. Copy the service's [deploy hook](https://render.com/docs/deploy-hooks) to the GitHub Actions repository secret `RENDER_DEPLOY_HOOK`. The included workflow runs integration tests and asks Render to deploy the exact passing commit on pushes to `main`.
6. Verify the live site can sign in and save a record. Make a visible change in VS Code, such as editing the `Overview` heading in `views/dashboard.ejs`. Commit and push it. Show the tests and deployment request in GitHub Actions, then show the matching commit going live on Render and refresh the dashboard.

## Integration test

Tests use a temporary database on the replica set specified by `TEST_MONGODB_URI`. Use a local test instance. In PowerShell:

```powershell
$env:TEST_MONGODB_URI = "mongodb://127.0.0.1:27017/?replicaSet=rs0"
npm test
```

In bash or zsh, use `TEST_MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' npm test`.

## Submission

Submit the compressed source folder without `node_modules` or `.env`. Copy `submission.example.txt` to `submission.txt`, fill in the requested details, and submit your filled copy directly to the instructor. For the oral demo, create an instructor, a course, and a student, enroll the student, demonstrate a staff user being denied an administrator action, and show a push triggering a Render redeployment.
