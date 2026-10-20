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
    get?: never;
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
    get?: never;
    put?: never;
    post?: never;
    /** Delete Export */
    delete: operations['delete_export_api_exports__job_id__delete'];
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
      status: 'ready' | 'not_installed' | 'installing' | 'error';
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
    /** ExportRequest */
    ExportRequest: {
      /** Documentid */
      documentId: string;
      /** Firstsection */
      firstSection?: number | null;
      /**
       * Format
       * @default mp3
       * @enum {string}
       */
      format: 'wav' | 'mp3';
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
    JobStatus: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'interrupted';
    /** PasteTextRequest */
    PasteTextRequest: {
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
      /** Bodydb */
      bodyDb?: number | null;
      /** Brightnessdb */
      brightnessDb?: number | null;
      /** Clippingratio */
      clippingRatio: number;
      /** Durations */
      durationS: number;
      /** Issues */
      issues: components['schemas']['QualityIssue'][];
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
    /** SessionCreate */
    SessionCreate: {
      cleanup?: components['schemas']['Cleanup'] | null;
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
      /** Promptid */
      promptId: string | null;
      quality: components['schemas']['QualityReport'];
      /**
       * Source
       * @enum {string}
       */
      source: 'recording' | 'import';
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
    /** VoiceProfileOut */
    VoiceProfileOut: {
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
      /** Voiceid */
      voiceId: string;
    };
    /** VoiceSessionOut */
    VoiceSessionOut: {
      /** Buildjobid */
      buildJobId: string | null;
      /** Candidates */
      candidates: components['schemas']['CandidateOut'][];
      cleanup: components['schemas']['Cleanup'] | null;
      /** Createdat */
      createdAt: string;
      /** Id */
      id: string;
      /** Requiredspeechs */
      requiredSpeechS: number;
      /** Takes */
      takes: components['schemas']['TakeOut'][];
      /** Updatedat */
      updatedAt: string;
      /** Usablespeechs */
      usableSpeechS: number;
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
