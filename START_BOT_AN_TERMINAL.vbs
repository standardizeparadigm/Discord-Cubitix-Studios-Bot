Option Explicit
Dim shell, fso, folder
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder

shell.Run "cmd /c node index.js", 0, False
