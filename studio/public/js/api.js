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

  async updatePart(project, partNumber, patch) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(project)}/part/${partNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Update failed');
    }
    return res.json();
  },

  async aiSlideData(project, partNumber, template) {
    const res = await fetch(`${this.baseUrl}/api/ai-slide-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, part_number: partNumber, template })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'AI slide-data failed');
    }
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

  getCustomUrl(project, file) {
    return `${this.baseUrl}/api/assets/${encodeURIComponent(project)}/custom/${encodeURIComponent(file)}`;
  },

  async uploadBackground(project, partNumber, file) {
    const formData = new FormData();
    formData.append('project', project);
    formData.append('part_number', partNumber);
    formData.append('file', file);

    const res = await fetch(`${this.baseUrl}/api/upload-background`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }
    return res.json();
  },

  async deleteCustomBackground(project, partNumber) {
    const res = await fetch(`${this.baseUrl}/api/upload-background`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, part_number: partNumber })
    });
    if (!res.ok) throw new Error('Delete failed');
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
  },

  async concatenateParts(project) {
    const res = await fetch(`${this.baseUrl}/api/record/concatenate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Concatenation failed');
    }
    return res.json();
  }
};
