!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  !insertmacro MUI_UNPAGE_COMPONENTS
!macroend

!macro customUnInstall
  DetailPrint "Removing Lares agent integrations..."
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --remove-adapters' $0
  ${If} $0 != 0
    Abort "Lares could not remove its agent integrations. The app was not removed."
  ${EndIf}
!macroend

!macro customUnInstallSection
  Section /o "un.Also delete Lares data"
    SetShellVarContext current
    RMDir /r "$APPDATA\Lares"
    RMDir /r "$APPDATA\lares"
    RMDir /r "$APPDATA\lares-app"
  SectionEnd
!macroend
