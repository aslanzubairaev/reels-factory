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

  async createProject({ display_name, language = 'ru', source_mode = 'studio', initial_script = null } = {}) {
    const res = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name, language, source_mode, initial_script })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create project');
    }
    return res.json();
  },

  async getProjectOutput(name) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}/output`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Не удалось получить список файлов');
    }
    return res.json();
  },

  getOutputFileUrl(projectName, fileName) {
    return `${this.baseUrl}/api/project/${encodeURIComponent(projectName)}/output/${encodeURIComponent(fileName)}`;
  },

  async revealProjectOutput(name) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}/reveal-output`, {
      method: 'POST'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Не удалось открыть папку');
    }
    return res.json();
  },

  async deleteProject(name) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Не удалось удалить проект');
    }
    return res.json();
  },

  async saveProjectScript(name, script, options = {}) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script,
        status: options.status,
        source_mode: options.source_mode
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save project');
    }
    return res.json();
  },

  async validateProject(name) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}/validate`, {
      method: 'POST'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Validation failed');
    }
    return res.json();
  },

  async getProjectPreferences(name) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}/preferences`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load project preferences');
    }
    return res.json();
  },

  async saveProjectPreferences(name, preferences) {
    const res = await fetch(`${this.baseUrl}/api/project/${encodeURIComponent(name)}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save project preferences');
    }
    return res.json();
  },

  getAssetUrl(project, file) {
    return `${this.baseUrl}/api/assets/${encodeURIComponent(project)}/${encodeURIComponent(file)}`;
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
    if (filename) {
      formData.append('filename', filename);
    }
    const uploadName = filename || 'recording';
    const uploadExt = String(videoBlob?.type || '').toLowerCase().startsWith('video/mp4') ? '.mp4' : '.webm';
    formData.append('video', videoBlob, uploadName + uploadExt);

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
