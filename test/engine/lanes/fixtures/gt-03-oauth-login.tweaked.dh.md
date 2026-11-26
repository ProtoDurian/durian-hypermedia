---
title: OAuth login
roles: { user: c1, app: c2, auth: c3, api: c4 }
---

# OAuth login with an authorization code

The app never sees the password. It gets a short code through the browser, then swaps the code for a token on a back channel.

```animation
title: Sign in with an identity provider | authorization code flow with PKCE
## Browser
user b: browser | the person signing in
## App
app a: photo app | app.example.com
## Identity provider
auth idp: login server | login.example.net
## API
api p: photo API | needs a token
@step Start: The person clicks "Sign in". The app sends the browser to the login server.
b -> a: click Sign in
a --> b: redirect to /authorize
b -> idp (auth): GET /authorize
@step Log in: The person types a password at the login server, never at the app.
light idp
say idp: password checked, consent given
@step Code: The login server sends the browser back to the app with a one-time code.
idp --> b (auth): redirect with code
b -> a: code=x7f2
text a: has code
@step Swap: The app swaps the code for a token, server to server. The browser is not involved.
a -> idp: code + verifier
idp -> a (auth): access token, 1 hour
text a: has token
@step Call: The app calls the API with the token. The API checks it and answers.
a -> p: GET /photos + token
p -> a (api): 200, 12 photos
tone p good
```
