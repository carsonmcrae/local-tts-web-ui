/**
 * Purpose: Generated TypeScript types for the local API (do not edit by hand).
 * Scope: Every request/response schema exposed by the FastAPI server.
 * Does NOT belong: Hand-written helpers — regenerate with `npm run api:types`.
 */
export type paths = {
  '/api/audio/{key}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Cached Audio
     * @description Play an already-generated clip by its content key (previews, direct media URLs).
     */
    get: operations['cached_audio_api_audio__key__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/cast-presets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Presets */
    get: operations['list_presets_api_cast_presets_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/cast-presets/{preset_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Delete Preset */
    delete: operations['delete_preset_api_cast_presets__preset_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Documents */
    get: operations['list_documents_api_documents_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Document */
    get: operations['get_document_api_documents__document_id__get'];
    put?: never;
    post?: never;
    /** Delete Document */
    delete: operations['delete_document_api_documents__document_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/bookmarks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Bookmarks */
    get: operations['list_bookmarks_api_documents__document_id__bookmarks_get'];
    put?: never;
    /**
     * Add Bookmark
     * @description Bookmark a sentence; bookmarking it again replaces its note.
     */
    post: operations['add_bookmark_api_documents__document_id__bookmarks_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/bookmarks/{bookmark_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Delete Bookmark */
    delete: operations['delete_bookmark_api_documents__document_id__bookmarks__bookmark_id__delete'];
    options?: never;
    head?: never;
    /** Update Bookmark */
    patch: operations['update_bookmark_api_documents__document_id__bookmarks__bookmark_id__patch'];
    trace?: never;
  };
  '/api/documents/{document_id}/cast': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update Cast
     * @description Choose the voice for quoted dialogue (null: the reading voice) and whether it is split from narration.
     */
    put: operations['update_cast_api_documents__document_id__cast_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/cast-presets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Save Preset */
    post: operations['save_preset_api_documents__document_id__cast_presets_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/cast-presets/{preset_id}/apply': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Apply Preset */
    post: operations['apply_preset_api_documents__document_id__cast_presets__preset_id__apply_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/characters': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Characters */
    get: operations['list_characters_api_documents__document_id__characters_get'];
    /**
     * Assign Character
     * @description Give a character a voice (or, with null, take it away); a name not found in the text is kept too.
     */
    put: operations['assign_character_api_documents__document_id__characters_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/cover': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Cover */
    get: operations['get_cover_api_documents__document_id__cover_get'];
    /** Upload Cover */
    put: operations['upload_cover_api_documents__document_id__cover_put'];
    post?: never;
    /** Delete Cover */
    delete: operations['delete_cover_api_documents__document_id__cover_delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/details': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Details */
    get: operations['get_details_api_documents__document_id__details_get'];
    /** Update Details */
    put: operations['update_details_api_documents__document_id__details_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/progress': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Save Progress */
    put: operations['save_progress_api_documents__document_id__progress_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/search': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Search Document */
    get: operations['search_document_api_documents__document_id__search_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/sections/{section_index}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Section */
    get: operations['get_section_api_documents__document_id__sections__section_index__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Section */
    patch: operations['update_section_api_documents__document_id__sections__section_index__patch'];
    trace?: never;
  };
  '/api/documents/{document_id}/segments/{index}/audio': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Segment Audio */
    get: operations['segment_audio_api_documents__document_id__segments__index__audio_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/segments/{index}/takes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Make Take
     * @description Generate another take of one sentence to listen to; keep it by setting the sentence's take.
     */
    post: operations['make_take_api_documents__document_id__segments__index__takes_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/{document_id}/styles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Styles */
    get: operations['get_styles_api_documents__document_id__styles_get'];
    /**
     * Update Styles
     * @description Set (or, with null, clear) a voice, effect, sound, style, take or pause on the chosen sentences.
     */
    put: operations['update_styles_api_documents__document_id__styles_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/text': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Paste Text */
    post: operations['paste_text_api_documents_text_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/upload': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Upload Document */
    post: operations['upload_document_api_documents_upload_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/documents/url': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Import Web Page */
    post: operations['import_web_page_api_documents_url_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/engines': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Engines */
    get: operations['list_engines_api_engines_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/engines/{engine_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Uninstall Engine */
    delete: operations['uninstall_engine_api_engines__engine_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/engines/{engine_id}/install': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Install Engine */
    post: operations['install_engine_api_engines__engine_id__install_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/engines/{engine_id}/repair': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Repair Engine */
    post: operations['repair_engine_api_engines__engine_id__repair_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/engines/{engine_id}/update': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Update Engine */
    post: operations['update_engine_api_engines__engine_id__update_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/exports': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Exports */
    get: operations['list_exports_api_exports_get'];
    put?: never;
    /** Start Export */
    post: operations['start_export_api_exports_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/exports/{job_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Export */
    get: operations['get_export_api_exports__job_id__get'];
    put?: never;
    post?: never;
    /** Delete Export */
    delete: operations['delete_export_api_exports__job_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/exports/{job_id}/audiobookshelf': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Send To Audiobookshelf */
    post: operations['send_to_audiobookshelf_api_exports__job_id__audiobookshelf_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/exports/{job_id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel Export */
    post: operations['cancel_export_api_exports__job_id__cancel_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/exports/{job_id}/download': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Download Export */
    get: operations['download_export_api_exports__job_id__download_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/exports/{job_id}/pause': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Pause Export */
    post: operations['pause_export_api_exports__job_id__pause_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/exports/{job_id}/resume': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Resume Export */
    post: operations['resume_export_api_exports__job_id__resume_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Health */
    get: operations['health_api_health_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/integrations/audiobookshelf': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Audiobookshelf */
    get: operations['get_audiobookshelf_api_integrations_audiobookshelf_get'];
    /** Save Audiobookshelf */
    put: operations['save_audiobookshelf_api_integrations_audiobookshelf_put'];
    post?: never;
    /** Forget Audiobookshelf */
    delete: operations['forget_audiobookshelf_api_integrations_audiobookshelf_delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/integrations/audiobookshelf/test': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Test Audiobookshelf
     * @description Check an address and key (the saved ones, or ones not saved yet) by listing what the key can upload to.
     */
    post: operations['test_audiobookshelf_api_integrations_audiobookshelf_test_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/jobs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Jobs */
    get: operations['list_jobs_api_jobs_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/jobs/{job_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Job */
    get: operations['get_job_api_jobs__job_id__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/jobs/{job_id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel Job */
    post: operations['cancel_job_api_jobs__job_id__cancel_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/preferences': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Preferences */
    get: operations['get_preferences_api_preferences_get'];
    /** Put Preferences */
    put: operations['put_preferences_api_preferences_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/pronunciations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Pronunciations */
    get: operations['list_pronunciations_api_pronunciations_get'];
    put?: never;
    /** Create Pronunciation */
    post: operations['create_pronunciation_api_pronunciations_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/pronunciations/{rule_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Update Pronunciation */
    put: operations['update_pronunciation_api_pronunciations__rule_id__put'];
    post?: never;
    /** Delete Pronunciation */
    delete: operations['delete_pronunciation_api_pronunciations__rule_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/speech-api': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Speech Api */
    get: operations['get_speech_api_api_speech_api_get'];
    /** Save Speech Api */
    put: operations['save_speech_api_api_speech_api_put'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/speech-api/activity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Speech Api Activity
     * @description Polled by the app shell: cheap, and says nothing beyond on/off and in use.
     */
    get: operations['speech_api_activity_api_speech_api_activity_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/speech-api/token': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create Token */
    post: operations['create_token_api_speech_api_token_post'];
    /** Revoke Token */
    delete: operations['revoke_token_api_speech_api_token_delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/system': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** System Info */
    get: operations['system_info_api_system_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/system/cache/clear': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Clear Cache */
    post: operations['clear_cache_api_system_cache_clear_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Profiles */
    get: operations['list_profiles_api_voice_profiles_get'];
    put?: never;
    /** Create Profile */
    post: operations['create_profile_api_voice_profiles_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/{profile_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Delete Profile */
    delete: operations['delete_profile_api_voice_profiles__profile_id__delete'];
    options?: never;
    head?: never;
    /** Update Profile */
    patch: operations['update_profile_api_voice_profiles__profile_id__patch'];
    trace?: never;
  };
  '/api/voice-profiles/{profile_id}/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Export Voice
     * @description The voice as a ``.ttsvoice`` package; ``confirm`` records that the owner chose to share it.
     */
    get: operations['export_voice_api_voice_profiles__profile_id__export_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/{profile_id}/reference': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Reference Audio */
    get: operations['reference_audio_api_voice_profiles__profile_id__reference_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/{profile_id}/styles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Build Styles
     * @description Teach a studio voice saved before speaking styles existed how the speaker asks, exclaims and talks.
     */
    post: operations['build_styles_api_voice_profiles__profile_id__styles_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/analyze': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Analyze Recording */
    post: operations['analyze_recording_api_voice_profiles_analyze_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/cleanup-preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Preview Cleanup
     * @description A recording with a cleanup applied, as WAV, to compare with the original.
     */
    post: operations['preview_cleanup_api_voice_profiles_cleanup_preview_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/consent': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Consent Statement */
    get: operations['consent_statement_api_voice_profiles_consent_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Import Voice
     * @description Import a ``.ttsvoice`` package someone shared, once the importer confirms the owner's permission.
     */
    post: operations['import_voice_api_voice_profiles_import_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-profiles/import/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Preview Voice File
     * @description What a ``.ttsvoice`` package holds, checked exactly as an import would be, without saving it.
     */
    post: operations['preview_voice_file_api_voice_profiles_import_preview_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Sessions */
    get: operations['list_sessions_api_voice_sessions_get'];
    put?: never;
    /** Create Session */
    post: operations['create_session_api_voice_sessions_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Session */
    get: operations['get_session_api_voice_sessions__session_id__get'];
    put?: never;
    post?: never;
    /** Delete Session */
    delete: operations['delete_session_api_voice_sessions__session_id__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/build': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Build Voice */
    post: operations['build_voice_api_voice_sessions__session_id__build_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/candidates/{index}/samples/{sample}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Candidate Sample */
    get: operations['candidate_sample_api_voice_sessions__session_id__candidates__index__samples__sample__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/finish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Finish Session */
    post: operations['finish_session_api_voice_sessions__session_id__finish_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Import Recording */
    post: operations['import_recording_api_voice_sessions__session_id__import_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/takes/{number}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Save Take */
    put: operations['save_take_api_voice_sessions__session_id__takes__number__put'];
    post?: never;
    /** Delete Take */
    delete: operations['delete_take_api_voice_sessions__session_id__takes__number__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/takes/{number}/audio': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Take Audio */
    get: operations['take_audio_api_voice_sessions__session_id__takes__number__audio_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/takes/{number}/previous/audio': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Previous Take Audio */
    get: operations['previous_take_audio_api_voice_sessions__session_id__takes__number__previous_audio_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/{session_id}/takes/{number}/restore': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Restore Take */
    post: operations['restore_take_api_voice_sessions__session_id__takes__number__restore_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voice-sessions/microphone-check': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Check Microphone */
    post: operations['check_microphone_api_voice_sessions_microphone_check_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voices': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Voices */
    get: operations['list_voices_api_voices_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/voices/{voice_id}/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Preview Voice */
    post: operations['preview_voice_api_voices__voice_id__preview_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
};
export type webhooks = Record<string, never>;
export type components = {
  schemas: {
    /** AbsFolder */
    AbsFolder: {
      /** Id */
      id: string;
      /** Path */
      path: string;
    };
    /** AbsLibrary */
    AbsLibrary: {
      /** Folders */
      folders: components['schemas']['AbsFolder'][];
      /** Id */
      id: string;
      /** Name */
      name: string;
    };
    /** AbsSettingsIn */
    AbsSettingsIn: {
      /** Apikey */
      apiKey?: string | null;
      /** Folderid */
      folderId?: string | null;
      /** Libraryid */
      libraryId?: string | null;
      /** Url */
      url: string;
    };
    /** AbsSettingsOut */
    AbsSettingsOut: {
      /** Configured */
      configured: boolean;
      /** Folderid */
      folderId?: string | null;
      /**
       * Haskey
       * @default false
       */
      hasKey: boolean;
      /** Libraryid */
      libraryId?: string | null;
      /** Url */
      url?: string | null;
    };
    /** BookmarkIn */
    BookmarkIn: {
      /**
       * Note
       * @default
       */
      note: string;
      /** Segmentindex */
      segmentIndex: number;
    };
    /** BookmarkOut */
    BookmarkOut: {
      /** Createdat */
      createdAt: string;
      /** Id */
      id: string;
      /** Note */
      note: string;
      /** Sectionindex */
      sectionIndex: number;
      /** Segmentindex */
      segmentIndex: number;
      /** Text */
      text: string;
    };
    /** CacheCleared */
    CacheCleared: {
      /** Removedentries */
      removedEntries: number;
    };
    /**
     * CandidateOut
     * @description A voice built from one take, with how closely its test samples matched the session's speaker.
     */
    CandidateOut: {
      /** Index */
      index: number;
      /** Promptid */
      promptId: string | null;
      /** Samples */
      samples: number;
      /** Similarity */
      similarity: number;
      /** Takenumber */
      takeNumber: number;
    };
    /** CastPresetIn */
    CastPresetIn: {
      /** Name */
      name: string;
    };
    /** CastPresetOut */
    CastPresetOut: {
      /** Characters */
      characters: {
        [key: string]: string;
      };
      /** Createdat */
      createdAt: string;
      /** Id */
      id: string;
      /** Name */
      name: string;
    };
    /** CastUpdate */
    CastUpdate: {
      /** Dialoguevoiceid */
      dialogueVoiceId?: string | null;
      /** Splitdialogue */
      splitDialogue?: boolean | null;
    };
    /** CharacterAssignment */
    CharacterAssignment: {
      /** Name */
      name: string;
      /** Voiceid */
      voiceId?: string | null;
    };
    /** CharacterOut */
    CharacterOut: {
      /** Lines */
      lines: number;
      /** Name */
      name: string;
      /** Sample */
      sample: string | null;
      /** Voiceid */
      voiceId: string | null;
    };
    /**
     * Cleanup
     * @description How a microphone's recordings are cleaned up before a voice is made from them.
     */
    Cleanup: {
      /**
       * Bassdb
       * @default 0
       */
      bassDb: number;
      /**
       * Lowcut
       * @default false
       */
      lowCut: boolean;
      /**
       * Noisereduction
       * @default 0
       */
      noiseReduction: number;
      /**
       * Trebledb
       * @default 0
       */
      trebleDb: number;
    };
    /** ConsentInfo */
    ConsentInfo: {
      /** Statement */
      statement: string;
    };
    /** DetailsIn */
    DetailsIn: {
      /** Author */
      author?: string | null;
      /** Description */
      description?: string | null;
      /** Narrator */
      narrator?: string | null;
    };
    /** DetailsOut */
    DetailsOut: {
      /** Author */
      author?: string | null;
      /** Description */
      description?: string | null;
      /**
       * Hascover
       * @default false
       */
      hasCover: boolean;
      /** Narrator */
      narrator?: string | null;
    };
    /** DocumentDetail */
    DocumentDetail: {
      /** Charcount */
      charCount: number;
      /** Createdat */
      createdAt: string;
      /** Estimatedseconds */
      estimatedSeconds: number;
      /** Filename */
      filename: string | null;
      /** Filetype */
      fileType: string;
      /** Id */
      id: string;
      /** Lastopenedat */
      lastOpenedAt: string | null;
      /** Pagecount */
      pageCount: number | null;
      progress?: components['schemas']['ReadingProgress'] | null;
      /** Sectioncount */
      sectionCount: number;
      /** Sections */
      sections: components['schemas']['SectionOut'][];
      /** Segmentcount */
      segmentCount: number;
      /** Sizebytes */
      sizeBytes: number;
      /** Title */
      title: string;
      /** Warnings */
      warnings: string[];
      /** Wordcount */
      wordCount: number;
    };
    /** DocumentStylesOut */
    DocumentStylesOut: {
      /** Dialoguevoiceid */
      dialogueVoiceId: string | null;
      /** Revision */
      revision: string;
      /** Segments */
      segments: components['schemas']['SegmentStyleOut'][];
      /**
       * Splitdialogue
       * @default true
       */
      splitDialogue: boolean;
    };
    /** DocumentSummary */
    DocumentSummary: {
      /** Charcount */
      charCount: number;
      /** Createdat */
      createdAt: string;
      /** Estimatedseconds */
      estimatedSeconds: number;
      /** Filename */
      filename: string | null;
      /** Filetype */
      fileType: string;
      /** Id */
      id: string;
      /** Lastopenedat */
      lastOpenedAt: string | null;
      /** Pagecount */
      pageCount: number | null;
      progress?: components['schemas']['ReadingProgress'] | null;
      /** Sectioncount */
      sectionCount: number;
      /** Segmentcount */
      segmentCount: number;
      /** Sizebytes */
      sizeBytes: number;
      /** Title */
      title: string;
      /** Wordcount */
      wordCount: number;
    };
    /**
     * EngineControl
     * @description A user-adjustable synthesis parameter the engine genuinely supports.
     */
    EngineControl: {
      /** Default */
      default: number;
      /** Label */
      label: string;
      /** Maximum */
      maximum: number;
      /** Minimum */
      minimum: number;
      /**
       * Name
       * @constant
       */
      name: 'pace';
      /** Step */
      step: number;
    };
    /** EngineInfo */
    EngineInfo: {
      /** Controls */
      controls: components['schemas']['EngineControl'][];
      /** Damagedfiles */
      damagedFiles?: string[];
      /** Description */
      description: string;
      /** Device */
      device: string | null;
      /** Hardwarenote */
      hardwareNote: string;
      /** Id */
      id: string;
      /** Installedbytes */
      installedBytes: number;
      /** Installjobid */
      installJobId?: string | null;
      /** Installoptions */
      installOptions: components['schemas']['InstallOption'][];
      /** Languages */
      languages: string[];
      /** License */
      license: string;
      /** Name */
      name: string;
      /** Optional */
      optional: boolean;
      /** Samplerate */
      sampleRate: number;
      /**
       * Status
       * @enum {string}
       */
      status: 'ready' | 'not_installed' | 'installing' | 'needs_repair' | 'error';
      /** Statusmessage */
      statusMessage: string;
      /** Supportscloning */
      supportsCloning: boolean;
      /**
       * Updateavailable
       * @default false
       */
      updateAvailable: boolean;
    };
    /**
     * ExportOut
     * @description An export job with what its working folder already holds.
     */
    ExportOut: {
      /**
       * Format
       * @enum {string}
       */
      format: 'wav' | 'mp3' | 'm4b' | 'epub';
      job: components['schemas']['JobOut'];
      /** Savedsentences */
      savedSentences: number;
      /** Sentences */
      sentences: number;
      /** Title */
      title: string;
      /** Workingbytes */
      workingBytes: number;
    };
    /** ExportRequest */
    ExportRequest: {
      /**
       * Captions
       * @default false
       */
      captions: boolean;
      /** Documentid */
      documentId: string;
      /** Firstsection */
      firstSection?: number | null;
      /**
       * Format
       * @default mp3
       * @enum {string}
       */
      format: 'wav' | 'mp3' | 'm4b' | 'epub';
      /** Lastsection */
      lastSection?: number | null;
      /**
       * Layout
       * @default single
       * @enum {string}
       */
      layout: 'single' | 'chapters';
      /**
       * Pace
       * @default 1
       */
      pace: number;
      /**
       * Usecover
       * @default true
       */
      useCover: boolean;
      /** Voiceid */
      voiceId: string;
    };
    /** FinishRequest */
    FinishRequest: {
      /** Candidate */
      candidate: number;
      /** Consent */
      consent: boolean;
      /**
       * Delivery
       * @default natural
       * @enum {string}
       */
      delivery: 'steady' | 'natural' | 'expressive';
      /** Name */
      name: string;
    };
    /** GpuInfo */
    GpuInfo: {
      /** Memorymb */
      memoryMb: number | null;
      /** Name */
      name: string;
      /** Vendor */
      vendor: string;
    };
    /** Health */
    Health: {
      /** Status */
      status: string;
      /** Version */
      version: string;
    };
    /** HTTPValidationError */
    HTTPValidationError: {
      /** Detail */
      detail?: components['schemas']['ValidationError'][];
    };
    /** InstallOption */
    InstallOption: {
      /** Description */
      description: string;
      /** Diskbytes */
      diskBytes: number;
      /** Downloadbytes */
      downloadBytes: number;
      /** Id */
      id: string;
      /** Label */
      label: string;
      /** Recommended */
      recommended: boolean;
    };
    /** InstallRequest */
    InstallRequest: {
      /** Option */
      option?: string | null;
    };
    /** JobOut */
    JobOut: {
      /** Createdat */
      createdAt: string;
      /** Errorcode */
      errorCode: string | null;
      /** Id */
      id: string;
      /** Kind */
      kind: string;
      /** Message */
      message: string;
      /** Payload */
      payload: {
        [key: string]: unknown;
      };
      /** Progress */
      progress: number;
      /** Result */
      result: {
        [key: string]: unknown;
      } | null;
      status: components['schemas']['JobStatus'];
      /** Updatedat */
      updatedAt: string;
    };
    /**
     * JobStatus
     * @enum {string}
     */
    JobStatus:
      'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'interrupted' | 'paused';
    /** NoteUpdate */
    NoteUpdate: {
      /** Note */
      note: string;
    };
    /** PasteTextRequest */
    PasteTextRequest: {
      /**
       * Speechmarks
       * @default false
       */
      speechMarks: boolean;
      /** Text */
      text: string;
      /** Title */
      title?: string | null;
    };
    /** Preferences */
    Preferences: {
      /**
       * Autoscroll
       * @default true
       */
      autoScroll: boolean;
      /**
       * Defaultvoiceid
       * @default kokoro:af_heart
       */
      defaultVoiceId: string;
      /**
       * Exportformat
       * @default mp3
       * @enum {string}
       */
      exportFormat: 'wav' | 'mp3';
      /**
       * Pace
       * @default 1
       */
      pace: number;
      /**
       * Playbackrate
       * @default 1
       */
      playbackRate: number;
      /**
       * Skipseconds
       * @default 15
       */
      skipSeconds: number;
    };
    /** PreviewRequest */
    PreviewRequest: {
      /**
       * Pace
       * @default 1
       */
      pace: number;
      /** Text */
      text?: string | null;
    };
    /**
     * PreviousTakeOut
     * @description The take a new recording of the same passage replaced, kept to compare with it and restore.
     */
    PreviousTakeOut: {
      /** Createdat */
      createdAt: string;
      /** Durations */
      durationS: number;
      quality: components['schemas']['QualityReport'];
    };
    /** ProfileUpdate */
    ProfileUpdate: {
      /** Delivery */
      delivery?: ('steady' | 'natural' | 'expressive') | null;
      /** Name */
      name?: string | null;
    };
    /** ProgressUpdate */
    ProgressUpdate: {
      /** Segmentindex */
      segmentIndex: number;
      /** Voiceid */
      voiceId?: string | null;
    };
    /** PronunciationIn */
    PronunciationIn: {
      /**
       * Matchcase
       * @default false
       */
      matchCase: boolean;
      /** Sayas */
      sayAs: string;
      /** Word */
      word: string;
    };
    /** PronunciationOut */
    PronunciationOut: {
      /** Createdat */
      createdAt: string;
      /** Id */
      id: string;
      /**
       * Matchcase
       * @default false
       */
      matchCase: boolean;
      /** Sayas */
      sayAs: string;
      /** Word */
      word: string;
    };
    /** QualityIssue */
    QualityIssue: {
      /** Code */
      code: string;
      /** Message */
      message: string;
      /**
       * Severity
       * @enum {string}
       */
      severity: 'error' | 'warning';
    };
    /** QualityReport */
    QualityReport: {
      /** Background */
      background?: string[] | null;
      /** Bodydb */
      bodyDb?: number | null;
      /** Brightnessdb */
      brightnessDb?: number | null;
      /** Clippingratio */
      clippingRatio: number;
      /** Coverage */
      coverage?: number | null;
      /** Durations */
      durationS: number;
      /** Issues */
      issues: components['schemas']['QualityIssue'][];
      /** Noisedbfs */
      noiseDbfs?: number | null;
      /** Ok */
      ok: boolean;
      /** Pauseratio */
      pauseRatio: number;
      /** Peakdbfs */
      peakDbfs: number;
      /** Rmsdbfs */
      rmsDbfs: number;
      /** Snrdb */
      snrDb: number;
      /** Speechs */
      speechS: number;
      /** Syllablesexpected */
      syllablesExpected?: number | null;
      /** Syllablesheard */
      syllablesHeard?: number | null;
    };
    /** ReadingProgress */
    ReadingProgress: {
      /** Percent */
      percent: number;
      /** Segmentindex */
      segmentIndex: number;
      /** Updatedat */
      updatedAt: string;
      /** Voiceid */
      voiceId: string | null;
    };
    /**
     * RecordingCheck
     * @description A recording's quality checks and the cleanup suggested for it (None when it needs none).
     */
    RecordingCheck: {
      report: components['schemas']['QualityReport'];
      suggested: components['schemas']['Cleanup'] | null;
    };
    /** SearchHit */
    SearchHit: {
      /** Sectionindex */
      sectionIndex: number;
      /** Segmentindex */
      segmentIndex: number;
      /** Text */
      text: string;
    };
    /** SearchResults */
    SearchResults: {
      /** Hits */
      hits: components['schemas']['SearchHit'][];
      /** Query */
      query: string;
      /** Total */
      total: number;
    };
    /** SectionContent */
    SectionContent: {
      /** Sectionindex */
      sectionIndex: number;
      /** Segments */
      segments: components['schemas']['SegmentOut'][];
    };
    /** SectionOut */
    SectionOut: {
      /** Index */
      index: number;
      /** Page */
      page?: number | null;
      /** Segmentcount */
      segmentCount: number;
      /** Startsegment */
      startSegment: number;
      /** Title */
      title: string;
    };
    /**
     * SectionUpdate
     * @description A reader's correction to a section: a new title, and/or the sentence it should start at.
     */
    SectionUpdate: {
      /** Startsegment */
      startSegment?: number | null;
      /** Title */
      title?: string | null;
    };
    /** SegmentOut */
    SegmentOut: {
      /**
       * Boundary
       * @enum {string}
       */
      boundary: 'sentence' | 'paragraph' | 'section';
      /** Index */
      index: number;
      /**
       * Kind
       * @enum {string}
       */
      kind: 'heading' | 'paragraph';
      /** Paragraphindex */
      paragraphIndex: number;
      /** Sectionindex */
      sectionIndex: number;
      /** Text */
      text: string;
    };
    /** SegmentStyleOut */
    SegmentStyleOut: {
      /** Effect */
      effect?:
        | (
            | 'loudspeaker'
            | 'telephone'
            | 'radio'
            | 'hall'
            | 'distant'
            | 'robot'
            | 'quiet'
            | 'memory'
          )
        | null;
      /** Index */
      index: number;
      /** Pausems */
      pauseMs?: number | null;
      /** Sound */
      sound?:
        | (
            | 'laugh'
            | 'chuckle'
            | 'sigh'
            | 'gasp'
            | 'cough'
            | 'clear throat'
            | 'sniff'
            | 'groan'
            | 'shush'
          )
        | null;
      /** Style */
      style?: ('narration' | 'question' | 'lively' | 'dialogue' | 'calm') | null;
      /** Take */
      take?: number | null;
      /** Voiceid */
      voiceId?: string | null;
    };
    /**
     * SegmentStyleUpdate
     * @description Set the given fields on the given sentences; a field sent as null clears it, one left out is kept.
     */
    SegmentStyleUpdate: {
      /** Effect */
      effect?:
        | (
            | 'loudspeaker'
            | 'telephone'
            | 'radio'
            | 'hall'
            | 'distant'
            | 'robot'
            | 'quiet'
            | 'memory'
          )
        | null;
      /** Indexes */
      indexes: number[];
      /** Pausems */
      pauseMs?: number | null;
      /** Sound */
      sound?:
        | (
            | 'laugh'
            | 'chuckle'
            | 'sigh'
            | 'gasp'
            | 'cough'
            | 'clear throat'
            | 'sniff'
            | 'groan'
            | 'shush'
          )
        | null;
      /** Style */
      style?: ('narration' | 'question' | 'lively' | 'dialogue' | 'calm') | null;
      /** Take */
      take?: number | null;
      /** Voiceid */
      voiceId?: string | null;
    };
    /** SentenceTakeOut */
    SentenceTakeOut: {
      /** Audiourl */
      audioUrl: string;
      /** Durations */
      durationS: number;
      /** Take */
      take: number;
    };
    /** SessionCreate */
    SessionCreate: {
      cleanup?: components['schemas']['Cleanup'] | null;
    };
    /** SpeechApiActivity */
    SpeechApiActivity: {
      /** Active */
      active: boolean;
      /** Enabled */
      enabled: boolean;
    };
    /** SpeechApiSettingsIn */
    SpeechApiSettingsIn: {
      /** Allowedvoices */
      allowedVoices?: string[];
      /**
       * Allownetwork
       * @default false
       */
      allowNetwork: boolean;
      /** Enabled */
      enabled: boolean;
    };
    /** SpeechApiStatus */
    SpeechApiStatus: {
      /** Allowedvoices */
      allowedVoices: string[];
      /** Allownetwork */
      allowNetwork: boolean;
      /** Enabled */
      enabled: boolean;
      /** Hastoken */
      hasToken: boolean;
      /** Maxinputchars */
      maxInputChars: number;
      /** Networkmode */
      networkMode: boolean;
      /** Port */
      port: number | null;
      /** Requestsperminute */
      requestsPerMinute: number;
      /** Tokencreatedat */
      tokenCreatedAt: string | null;
      usage: components['schemas']['SpeechApiUsage'];
    };
    /**
     * SpeechApiToken
     * @description A new token: the only time it is ever sent.
     */
    SpeechApiToken: {
      /** Createdat */
      createdAt: string;
      /** Token */
      token: string;
    };
    /** SpeechApiUsage */
    SpeechApiUsage: {
      /** Active */
      active: boolean;
      /** Inprogress */
      inProgress: boolean;
      /** Lastusedat */
      lastUsedAt: string | null;
      /** Lastvoiceid */
      lastVoiceId: string | null;
      /** Requests */
      requests: number;
    };
    /** StorageInfo */
    StorageInfo: {
      /** Audiocachebytes */
      audioCacheBytes: number;
      /** Audiocachelimitbytes */
      audioCacheLimitBytes: number;
      /** Databasebytes */
      databaseBytes: number;
      /** Datadir */
      dataDir: string;
      /** Exportsbytes */
      exportsBytes: number;
      /** Freebytes */
      freeBytes: number;
      /** Modelsbytes */
      modelsBytes: number;
      /** Totalbytes */
      totalBytes: number;
      /** Voicesbytes */
      voicesBytes: number;
    };
    /**
     * StyleCoverage
     * @description How many usable takes can teach one speaking style (narration, question, lively, dialogue, calm).
     */
    StyleCoverage: {
      /** Style */
      style: string;
      /** Takes */
      takes: number;
    };
    /** SystemInfo */
    SystemInfo: {
      /** Cpucores */
      cpuCores: number;
      /** Gpus */
      gpus: components['schemas']['GpuInfo'][];
      /** Limits */
      limits: {
        [key: string]: number;
      };
      /** Machine */
      machine: string;
      /** Memoryavailablebytes */
      memoryAvailableBytes: number;
      /** Memorytotalbytes */
      memoryTotalBytes: number;
      /** Networkexposed */
      networkExposed: boolean;
      /** Onnxproviders */
      onnxProviders: string[];
      /** Platform */
      platform: string;
      /** Python */
      python: string;
      storage: components['schemas']['StorageInfo'];
      /**
       * Telemetry
       * @default false
       */
      telemetry: boolean;
      /** Version */
      version: string;
    };
    /** TakeOut */
    TakeOut: {
      /** Createdat */
      createdAt: string;
      /** Durations */
      durationS: number;
      /** Number */
      number: number;
      previous?: components['schemas']['PreviousTakeOut'] | null;
      /** Promptid */
      promptId: string | null;
      quality: components['schemas']['QualityReport'];
      /**
       * Source
       * @enum {string}
       */
      source: 'recording' | 'import';
    };
    /** TakeRequest */
    TakeRequest: {
      /**
       * Pace
       * @default 1
       */
      pace: number;
      /** Take */
      take?: number | null;
      /** Voiceid */
      voiceId: string;
    };
    /** ValidationError */
    ValidationError: {
      /** Context */
      ctx?: Record<string, never>;
      /** Input */
      input?: unknown;
      /** Location */
      loc: (string | number)[];
      /** Message */
      msg: string;
      /** Error Type */
      type: string;
    };
    /** VoiceInfo */
    VoiceInfo: {
      /**
       * Available
       * @default true
       */
      available: boolean;
      /**
       * Category
       * @enum {string}
       */
      category: 'built-in' | 'custom';
      /**
       * Description
       * @default
       */
      description: string;
      /** Engineid */
      engineId: string;
      /**
       * Gender
       * @enum {string}
       */
      gender: 'female' | 'male' | 'unspecified';
      /** Id */
      id: string;
      /** Language */
      language: string;
      /** Languagecode */
      languageCode: string;
      /** Name */
      name: string;
      /** Qualitygrade */
      qualityGrade?: string | null;
    };
    /**
     * VoicePreview
     * @description What a voice file holds, shown before it is imported (nothing is saved to show it).
     */
    VoicePreview: {
      /** Appversion */
      appVersion: string | null;
      /** Consentedat */
      consentedAt: string;
      /** Consentstatement */
      consentStatement: string;
      /** Createdat */
      createdAt: string | null;
      /** Creator */
      creator: string | null;
      /**
       * Delivery
       * @enum {string}
       */
      delivery: 'steady' | 'natural' | 'expressive';
      /** Description */
      description: string | null;
      /** Durations */
      durationS: number;
      /** Exportedat */
      exportedAt: string;
      /** Formatversion */
      formatVersion: number;
      /**
       * Humanvoice
       * @default true
       */
      humanVoice: boolean;
      /**
       * Kind
       * @enum {string}
       */
      kind: 'quick' | 'studio';
      /** Name */
      name: string;
      /** Sizebytes */
      sizeBytes: number;
      /** Styles */
      styles: string[];
    };
    /** VoiceProfileOut */
    VoiceProfileOut: {
      /**
       * Canrefine
       * @default false
       */
      canRefine: boolean;
      /** Consentedat */
      consentedAt: string;
      /** Createdat */
      createdAt: string;
      /**
       * Delivery
       * @default natural
       * @enum {string}
       */
      delivery: 'steady' | 'natural' | 'expressive';
      /** Durations */
      durationS: number;
      /** Engineid */
      engineId: string;
      /** Id */
      id: string;
      /**
       * Kind
       * @default quick
       * @enum {string}
       */
      kind: 'quick' | 'studio';
      /** Name */
      name: string;
      quality: components['schemas']['QualityReport'];
      /** Samplerate */
      sampleRate: number;
      /** Source */
      source: string;
      /**
       * Stores
       * @default A trimmed copy of your reference recording (WAV). No model is trained or uploaded.
       */
      stores: string;
      /** Styles */
      styles?: string[];
      /** Voiceid */
      voiceId: string;
    };
    /** VoiceSessionOut */
    VoiceSessionOut: {
      /** Buildjobid */
      buildJobId: string | null;
      /** Canbuild */
      canBuild: boolean;
      /** Candidates */
      candidates: components['schemas']['CandidateOut'][];
      cleanup: components['schemas']['Cleanup'] | null;
      /** Complete */
      complete: boolean;
      /** Createdat */
      createdAt: string;
      /** Id */
      id: string;
      /** Minimumspeechs */
      minimumSpeechS: number;
      /** Requiredspeechs */
      requiredSpeechS: number;
      /** Styles */
      styles: components['schemas']['StyleCoverage'][];
      /** Takes */
      takes: components['schemas']['TakeOut'][];
      /**
       * Tier
       * @enum {string}
       */
      tier: 'starting' | 'foundation' | 'developing' | 'complete';
      /** Updatedat */
      updatedAt: string;
      /** Usablespeechs */
      usableSpeechS: number;
    };
    /** WebPageRequest */
    WebPageRequest: {
      /** Url */
      url: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
  cached_audio_api_audio__key__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_presets_api_cast_presets_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CastPresetOut'][];
        };
      };
    };
  };
  delete_preset_api_cast_presets__preset_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        preset_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_documents_api_documents_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentSummary'][];
        };
      };
    };
  };
  get_document_api_documents__document_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_document_api_documents__document_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_bookmarks_api_documents__document_id__bookmarks_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BookmarkOut'][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  add_bookmark_api_documents__document_id__bookmarks_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['BookmarkIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BookmarkOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_bookmark_api_documents__document_id__bookmarks__bookmark_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        bookmark_id: string;
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_bookmark_api_documents__document_id__bookmarks__bookmark_id__patch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        bookmark_id: string;
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NoteUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BookmarkOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_cast_api_documents__document_id__cast_put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CastUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentStylesOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  save_preset_api_documents__document_id__cast_presets_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CastPresetIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CastPresetOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  apply_preset_api_documents__document_id__cast_presets__preset_id__apply_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
        preset_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CharacterOut'][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_characters_api_documents__document_id__characters_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CharacterOut'][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  assign_character_api_documents__document_id__characters_put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CharacterAssignment'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CharacterOut'][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_cover_api_documents__document_id__cover_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  upload_cover_api_documents__document_id__cover_put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DetailsOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_cover_api_documents__document_id__cover_delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_details_api_documents__document_id__details_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DetailsOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_details_api_documents__document_id__details_put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DetailsIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DetailsOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  save_progress_api_documents__document_id__progress_put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProgressUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  search_document_api_documents__document_id__search_get: {
    parameters: {
      query: {
        q: string;
      };
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SearchResults'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_section_api_documents__document_id__sections__section_index__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
        section_index: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SectionContent'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_section_api_documents__document_id__sections__section_index__patch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
        section_index: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SectionUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  segment_audio_api_documents__document_id__segments__index__audio_get: {
    parameters: {
      query: {
        pace?: number;
        prefetch?: boolean;
        voice: string;
      };
      header?: never;
      path: {
        document_id: string;
        index: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  make_take_api_documents__document_id__segments__index__takes_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
        index: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TakeRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SentenceTakeOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_styles_api_documents__document_id__styles_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentStylesOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_styles_api_documents__document_id__styles_put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        document_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SegmentStyleUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentStylesOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  paste_text_api_documents_text_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PasteTextRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  upload_document_api_documents_upload_post: {
    parameters: {
      query: {
        filename: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  import_web_page_api_documents_url_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['WebPageRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentDetail'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_engines_api_engines_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EngineInfo'][];
        };
      };
    };
  };
  uninstall_engine_api_engines__engine_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        engine_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  install_engine_api_engines__engine_id__install_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        engine_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['InstallRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  repair_engine_api_engines__engine_id__repair_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        engine_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_engine_api_engines__engine_id__update_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        engine_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_exports_api_exports_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExportOut'][];
        };
      };
    };
  };
  start_export_api_exports_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExportRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_export_api_exports__job_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExportOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_export_api_exports__job_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  send_to_audiobookshelf_api_exports__job_id__audiobookshelf_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  cancel_export_api_exports__job_id__cancel_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  download_export_api_exports__job_id__download_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  pause_export_api_exports__job_id__pause_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  resume_export_api_exports__job_id__resume_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  health_api_health_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
    };
  };
  get_audiobookshelf_api_integrations_audiobookshelf_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AbsSettingsOut'];
        };
      };
    };
  };
  save_audiobookshelf_api_integrations_audiobookshelf_put: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AbsSettingsIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AbsSettingsOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  forget_audiobookshelf_api_integrations_audiobookshelf_delete: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  test_audiobookshelf_api_integrations_audiobookshelf_test_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['AbsSettingsIn'] | null;
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AbsLibrary'][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_jobs_api_jobs_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'][];
        };
      };
    };
  };
  get_job_api_jobs__job_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  cancel_job_api_jobs__job_id__cancel_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_preferences_api_preferences_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Preferences'];
        };
      };
    };
  };
  put_preferences_api_preferences_put: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['Preferences'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Preferences'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_pronunciations_api_pronunciations_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PronunciationOut'][];
        };
      };
    };
  };
  create_pronunciation_api_pronunciations_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PronunciationIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PronunciationOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_pronunciation_api_pronunciations__rule_id__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        rule_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PronunciationIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PronunciationOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_pronunciation_api_pronunciations__rule_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        rule_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_speech_api_api_speech_api_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SpeechApiStatus'];
        };
      };
    };
  };
  save_speech_api_api_speech_api_put: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SpeechApiSettingsIn'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SpeechApiStatus'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  speech_api_activity_api_speech_api_activity_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SpeechApiActivity'];
        };
      };
    };
  };
  create_token_api_speech_api_token_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SpeechApiToken'];
        };
      };
    };
  };
  revoke_token_api_speech_api_token_delete: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  system_info_api_system_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SystemInfo'];
        };
      };
    };
  };
  clear_cache_api_system_cache_clear_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CacheCleared'];
        };
      };
    };
  };
  list_profiles_api_voice_profiles_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceProfileOut'][];
        };
      };
    };
  };
  create_profile_api_voice_profiles_post: {
    parameters: {
      query: {
        bassDb?: number;
        consent: boolean;
        lowCut?: boolean;
        name: string;
        noiseReduction?: number;
        source?: 'recording' | 'import';
        trebleDb?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceProfileOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_profile_api_voice_profiles__profile_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profile_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  update_profile_api_voice_profiles__profile_id__patch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profile_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProfileUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceProfileOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  export_voice_api_voice_profiles__profile_id__export_get: {
    parameters: {
      query?: {
        confirm?: boolean;
      };
      header?: never;
      path: {
        profile_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/zip': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  reference_audio_api_voice_profiles__profile_id__reference_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profile_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  build_styles_api_voice_profiles__profile_id__styles_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profile_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  analyze_recording_api_voice_profiles_analyze_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RecordingCheck'];
        };
      };
    };
  };
  preview_cleanup_api_voice_profiles_cleanup_preview_post: {
    parameters: {
      query?: {
        bassDb?: number;
        lowCut?: boolean;
        noiseReduction?: number;
        trebleDb?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'audio/wav': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  consent_statement_api_voice_profiles_consent_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConsentInfo'];
        };
      };
    };
  };
  import_voice_api_voice_profiles_import_post: {
    parameters: {
      query: {
        consent: boolean;
        name?: string | null;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceProfileOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  preview_voice_file_api_voice_profiles_import_preview_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoicePreview'];
        };
      };
    };
  };
  list_sessions_api_voice_sessions_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceSessionOut'][];
        };
      };
    };
  };
  create_session_api_voice_sessions_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['SessionCreate'] | null;
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceSessionOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_session_api_voice_sessions__session_id__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceSessionOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_session_api_voice_sessions__session_id__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  build_voice_api_voice_sessions__session_id__build_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  candidate_sample_api_voice_sessions__session_id__candidates__index__samples__sample__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        index: number;
        sample: number;
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  finish_session_api_voice_sessions__session_id__finish_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['FinishRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceProfileOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  import_recording_api_voice_sessions__session_id__import_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceSessionOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  save_take_api_voice_sessions__session_id__takes__number__put: {
    parameters: {
      query?: {
        promptId?: string | null;
        text?: string | null;
      };
      header?: never;
      path: {
        number: number;
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TakeOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_take_api_voice_sessions__session_id__takes__number__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  take_audio_api_voice_sessions__session_id__takes__number__audio_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'audio/wav': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  previous_take_audio_api_voice_sessions__session_id__takes__number__previous_audio_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'audio/wav': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  restore_take_api_voice_sessions__session_id__takes__number__restore_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
        session_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TakeOut'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  check_microphone_api_voice_sessions_microphone_check_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RecordingCheck'];
        };
      };
    };
  };
  list_voices_api_voices_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VoiceInfo'][];
        };
      };
    };
  };
  preview_voice_api_voices__voice_id__preview_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        voice_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PreviewRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
}
