!macro customInstall
  ; Only public program files live in INSTDIR. Personal data is in userData.
  ; Electron's renderer sandbox must be able to read the installed program.
  IfFileExists "$INSTDIR\StreamDesk.exe" 0 streamdesk_acl_done
  ExecWait '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-15-2-1:(OI)(CI)(RX)"' $0
  streamdesk_acl_done:
!macroend
