; VinceZone Studio — Windows NSIS Installer Script
; Built with `pnpm build:installer`

!include "MUI2.nsh"

!ifndef APP_VERSION
  !define APP_VERSION "2.0.0"
!endif
!ifndef SOURCE_DIR
  !define SOURCE_DIR "..\desktop\VinceZone Studio"
!endif
!ifndef OUTPUT_FILE
  !define OUTPUT_FILE "..\desktop\VinceZone-Studio-Setup-${APP_VERSION}.exe"
!endif

Name "VinceZone Studio ${APP_VERSION}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\VinceZone Studio"
InstallDirRegKey HKCU "Software\VinceZone Studio" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "vincezone-logo.ico"
!define MUI_UNICON "vincezone-logo.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\VinceZone Studio.exe"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "VinceZone Studio" SecMain
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"

  WriteRegStr HKCU "Software\VinceZone Studio" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VinceZone Studio" "DisplayName" "VinceZone Studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VinceZone Studio" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VinceZone Studio" "Publisher" "VinceZone"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VinceZone Studio" "DisplayIcon" "$INSTDIR\VinceZone Studio.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VinceZone Studio" "UninstallString" '"$INSTDIR\Uninstall.exe"'

  CreateDirectory "$SMPROGRAMS\VinceZone Studio"
  CreateShortCut "$SMPROGRAMS\VinceZone Studio\VinceZone Studio.lnk" "$INSTDIR\VinceZone Studio.exe"
  CreateShortCut "$SMPROGRAMS\VinceZone Studio\Uninstall VinceZone Studio.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\VinceZone Studio.lnk" "$INSTDIR\VinceZone Studio.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\VinceZone Studio.lnk"
  RMDir /r "$SMPROGRAMS\VinceZone Studio"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\VinceZone Studio"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VinceZone Studio"
SectionEnd
