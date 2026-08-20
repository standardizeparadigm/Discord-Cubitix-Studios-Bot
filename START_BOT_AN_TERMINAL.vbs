' =============================================================
'  Cubitix Studios - Chay bot AN, KHONG hien cua so terminal
'  Bam dup vao file nay de chay bot ngam hoan toan.
'  Muon TAT bot: bam dup vao file TAT_BOT.bat
' =============================================================
Option Explicit
Dim shell, fso, folder
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Lay duong dan thu muc chua file .vbs nay
folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder

' Tham so cuoi = 0 nghia la chay AN (khong hien cua so), False = khong cho
shell.Run "cmd /c node index.js", 0, False
