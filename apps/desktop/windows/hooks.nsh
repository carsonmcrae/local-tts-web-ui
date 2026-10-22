; SPDX-License-Identifier: MIT
; Copyright (c) 2026 Carson McRae
;
; Purpose: TTSNative's additions to Tauri's NSIS installer and uninstaller.
; Scope: An install or update stops before it touches anything when the drive lacks the room for the
;   new version, says so, and an in-app update then reopens the version that is installed; upgrades
;   replace the bundled runtime as a whole (files a newer version no longer ships don't linger); and
;   removing personal data at uninstall needs a second, explicit confirmation that names everything that
;   will be deleted. Data is kept by default and is never touched during updates.
; Does NOT belong: The installer itself (Tauri's template, configured in src-tauri/tauri.conf.json) or
;   anything about the user's files beyond this confirmation.

; Room the new version needs on top of what is installed: Tauri's estimate of the program files
; (${ESTIMATEDSIZE}, in KB) plus a margin for the installer's own temporary files. The previous version
; stays whole until the new files are in place, so an upgrade needs the full size again, not the
; difference.
!define TTSNATIVE_SPACE_MARGIN_MB 200

!macro NSIS_HOOK_PREINSTALL
  IntOp $R8 ${ESTIMATEDSIZE} / 1024
  IntOp $R8 $R8 + ${TTSNATIVE_SPACE_MARGIN_MB}
  ${GetRoot} "$INSTDIR" $R9
  ClearErrors
  ${DriveSpace} "$R9\" "/D=F /S=M" $R7
  ${IfNot} ${Errors}
  ${AndIf} $R7 < $R8
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONSTOP \
        "TTSNative needs about $R8 MB free on drive $R9 to install this version, and $R7 MB is free.$\n$\nFree some space and run the installer again. Nothing was changed: your documents and voices are kept."
    ${EndIf}
    ; An in-app update already closed TTSNative; give the installed version back.
    ${If} $UpdateMode = 1
    ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
    ${EndIf}
    SetErrorLevel 3
    Abort "Not enough free space on drive $R9: $R7 MB free, about $R8 MB needed."
  ${EndIf}
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
      "Delete your TTSNative data as well?$\n$\nThis permanently deletes, for this Windows account:$\n$\n$LOCALAPPDATA\${BUNDLEID}$\n(the documents in your library, your custom voices and recordings, exported audio kept by TTSNative, downloaded models, settings and logs)$\n$\n$APPDATA\${BUNDLEID}$\n(the remembered window size and position)$\n$\nHKEY_CURRENT_USER\${MANUPRODUCTKEY}$\n(the registry entry where the installer notes its folder)$\n$\nChoose No to uninstall the app and keep all of it for a later reinstall." \
      IDYES ttsnative_keep_choice
    StrCpy $DeleteAppDataCheckboxState 0
    ttsnative_keep_choice:
  ${EndIf}
!macroend
