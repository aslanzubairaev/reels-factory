/**
 * API module — requests to Node.js server
 */
const API = {
  baseUrl: '',

  async getProjects() {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw new Error('Failed to load projects');
    return res.json();
  },

  async getProject(name) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('Failed to load project');
    return res.json();
  },

  getAssetUrl(project, file) {
    return `${this.baseUrl}/api/assets/${encodeURIComponent(project)}/${encodeURIComponent(file)}`;
  },

  async generate({ project, part_number, prompt, type, duration }) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, part_number, prompt, type, duration })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Generation failed');
    }
    return res.json();
  },

  async saveRecording(project, filename, videoBlob) {
    const formData = new FormData();
    formData.append('project', project);
    formData.append('filename', filename);
    formData.append('video', videoBlob, filename + '.webm');

    const res = await fetch(`${this.baseUrl}/api/record/save`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to save recording');
    return res.json();
  },

  async convertRecording(project, filename) {
    const res = await fetch(`${this.baseUrl}/api/record/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, filename })
    });
    if (!res.ok) throw new Error('Conversion failed');
    return res.json();
  }
};
