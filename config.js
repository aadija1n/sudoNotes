/* Configuration.
   owner / repo / branch / root describe the NOTES repository: the separate, public GitHub
   repo that holds all your notes. This site's own repo is never used for notes.
   - Leave owner and repo empty while no notes repository is set. Visitors then see a
     "not configured" notice. Log in with W and use "Set notes repository" and the app
     writes this file for you.
   - branch: leave empty to use the repository's default branch.
   - root: the folder in the notes repo that holds all subjects (default "notes"). */
window.NOTES_CONFIG = {
  owner: "aadija1n",
  repo: "sample-notes",
  branch: "main",
  root: "notes",
};
