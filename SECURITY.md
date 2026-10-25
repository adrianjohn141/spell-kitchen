# Security policy

Please report vulnerabilities privately through GitHub: **Security > Report a vulnerability** on this repository. Do not open a public issue.

Model API keys belong only in `.env.local`, which is git-ignored and read on the server by `/api/generate`. They are never sent to the browser. If you think a key was exposed, rotate it with your provider first.
