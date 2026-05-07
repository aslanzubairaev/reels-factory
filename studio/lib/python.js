const { execFileSync } = require('child_process');

let cachedPythonCommand = null;

function getPythonCandidates() {
  const candidates = [];
  if (process.env.PYTHON_BIN) candidates.push(process.env.PYTHON_BIN);
  candidates.push('python', 'py', 'python3');
  return [...new Set(candidates.filter(Boolean))];
}

function resolvePythonCommand() {
  if (cachedPythonCommand) return cachedPythonCommand;

  for (const command of getPythonCandidates()) {
    try {
      execFileSync(command, ['--version'], { stdio: 'pipe', windowsHide: true });
      cachedPythonCommand = command;
      return cachedPythonCommand;
    } catch (_) {
      // Try the next candidate.
    }
  }

  return null;
}

function getPythonCommand() {
  const command = resolvePythonCommand();
  if (!command) {
    throw new Error(
      'Python interpreter not found. Install Python and make sure `python` or `py` is available in PATH, or set PYTHON_BIN in .env.'
    );
  }
  return command;
}

module.exports = {
  getPythonCommand,
  resolvePythonCommand
};
