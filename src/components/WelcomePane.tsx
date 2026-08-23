const GIT_COMMANDS = [
  { cmd: "git init", desc: "Initialize a new repository" },
  { cmd: "git clone <url>", desc: "Clone a remote repository locally" },
  { cmd: "git status", desc: "Show working tree status" },
  { cmd: "git add <file>", desc: "Stage a file for commit" },
  { cmd: "git add .", desc: "Stage all changed files" },
  { cmd: 'git commit -m "<msg>"', desc: "Commit staged changes with a message" },
  { cmd: "git push", desc: "Push commits to the remote" },
  { cmd: "git pull", desc: "Fetch and merge from remote" },
  { cmd: "git branch", desc: "List all local branches" },
  { cmd: "git checkout -b <name>", desc: "Create and switch to a new branch" },
  { cmd: "git merge <branch>", desc: "Merge a branch into the current one" },
  { cmd: "git log --oneline", desc: "View compact commit history" },
  { cmd: "git diff", desc: "Show unstaged changes" },
  { cmd: "git stash", desc: "Stash working directory changes" },
  { cmd: "git stash pop", desc: "Re-apply the most recent stash" },
  { cmd: "git reset HEAD~1", desc: "Undo the last commit (keep changes)" },
];

const GH_COMMANDS = [
  { cmd: "gh auth login", desc: "Authenticate with GitHub" },
  { cmd: "gh repo create", desc: "Create a new GitHub repository" },
  { cmd: "gh repo clone <repo>", desc: "Clone a GitHub repository" },
  { cmd: "gh pr create", desc: "Open a pull request for current branch" },
  { cmd: "gh pr list", desc: "List open pull requests" },
  { cmd: "gh pr checkout <num>", desc: "Check out a PR branch locally" },
  { cmd: "gh pr merge <num>", desc: "Merge a pull request" },
  { cmd: "gh issue create", desc: "Create a new issue" },
  { cmd: "gh issue list", desc: "List issues in the repository" },
  { cmd: "gh issue close <num>", desc: "Close an issue" },
  { cmd: "gh run list", desc: "List recent GitHub Actions runs" },
  { cmd: "gh run view <id>", desc: "View a workflow run's details" },
  { cmd: "gh release create <tag>", desc: "Create a new release" },
];

export default function WelcomePane() {
  return (
    <div className="welcome-pane">
      <div className="welcome-watermark">राधावल्लभ श्री हरिवंश</div>
      <div className="welcome-hint">Open a file to start editing · Click a file in the sidebar</div>
      <div className="welcome-sections">
        <section className="welcome-section">
          <h3>Git</h3>
          <table className="cmd-table">
            <tbody>
              {GIT_COMMANDS.map(({ cmd, desc }) => (
                <tr key={cmd}>
                  <td><code>{cmd}</code></td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="welcome-section">
          <h3>GitHub CLI</h3>
          <table className="cmd-table">
            <tbody>
              {GH_COMMANDS.map(({ cmd, desc }) => (
                <tr key={cmd}>
                  <td><code>{cmd}</code></td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
