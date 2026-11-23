Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
desktopDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(desktopDir)
shell.CurrentDirectory = rootDir

electronExe = rootDir & "\node_modules\electron\dist\electron.exe"
mainJs = rootDir & "\electron\main.cjs"

If fso.FileExists(electronExe) Then
  shell.Run """" & electronExe & """ """ & mainJs & """", 1, False
Else
  shell.Run "cmd /c pnpm desktop", 0, False
End If
