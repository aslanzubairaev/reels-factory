/**
 * Translate module — handles prompt display language in studio
 *
 * Server handles actual translation (Claude API).
 * This module manages display: shows background_prompt_display to user,
 * sends original text to server which translates before generation.
 */
const Translate = {
  /**
   * Get the display prompt for a part (user's language)
   */
  getDisplayPrompt(part) {
    return part.background_prompt_display || part.background_prompt || '';
  },

  /**
   * Check if text appears to be non-English (needs translation)
   */
  isNonEnglish(text) {
    const nonAscii = text.replace(/[a-zA-Z0-9\s.,!?'":\-;()@#$%^&*=+/\\|{}\[\]<>~`]/g, '');
    return nonAscii.length > 0;
  }
};
