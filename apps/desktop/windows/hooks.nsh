; SPDX-License-Identifier: MIT
; Copyright (c) 2026 Carson McRae
;
; Purpose: TTSNative's additions to Tauri's NSIS installer and uninstaller.
; Scope: Upgrades replace the bundled runtime as a whole (files a newer version no longer ships don't
;   linger), and removing personal data at uninstall needs a second, explicit confirmation that names
;   what will be deleted. Data is kept by default and is never touched during updates.
; Does NOT belong: The installer itself (Tauri's template, configured in src-tauri/tauri.conf.json) or
;   anything about the user's files beyond this confirmation.

!macro NSIS_HOOK_PREINSTALL
  ; Moving the old runtime aside fails while TTSNative still runs (its files are in use); then the
  ; installer's own running-app check closes it and the files are simply overwritten.
  RMDir /r "$INSTDIR\runtime.old"
  ClearErrors
  Rename "$INSTDIR\runtime" "$INSTDIR\runtime.old"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  RMDir /r "$INSTDIR\runtime.old"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  RMDir /r "$INSTDIR\runtime.old"
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    IfSilent ttsnative_keep_choice 0
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "Delete your TTSNative data as well?$\n$\nThis permanently deletes the documents in your library, your custom voices and recordings, exported audio kept by TTSNative, and downloaded models, from:$\n$LOCALAPPDATA\${BUNDLEID}$\n$\nChoose No to uninstall the app and keep your data for a later reinstall." \
      IDYES ttsnative_keep_choice
    StrCpy $DeleteAppDataCheckboxState 0
    ttsnative_keep_choice:
  ${EndIf}
!macroend
