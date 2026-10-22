$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Security
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class NocturneNss {
 [StructLayout(LayoutKind.Sequential)] public struct Item { public int type; public IntPtr data; public uint len; }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr LoadLibraryEx(string name, IntPtr file, uint flags);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int NSS_Init(byte[] path);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int NSS_InitReadWrite(byte[] path);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int NSS_Shutdown();
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr PK11_GetInternalKeySlot();
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern void PK11_FreeSlot(IntPtr slot);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int PK11_CheckUserPassword(IntPtr slot, byte[] password);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int PK11_InitPin(IntPtr slot, IntPtr old, byte[] password);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int PK11SDR_Decrypt(ref Item input, ref Item output, IntPtr context);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int PK11SDR_EncryptWithMechanism(IntPtr slot, ref Item key, uint mechanism, ref Item input, ref Item output, IntPtr context);
 [DllImport("nss3.dll", CallingConvention=CallingConvention.Cdecl)] public static extern void SECITEM_ZfreeItem(ref Item item, int free);
 public static string Decrypt(string value) {
  byte[] bytes=Convert.FromBase64String(value);IntPtr ptr=Marshal.AllocHGlobal(bytes.Length);Item output=new Item();
  try { Marshal.Copy(bytes,0,ptr,bytes.Length);Item input=new Item{data=ptr,len=(uint)bytes.Length};if(PK11SDR_Decrypt(ref input,ref output,IntPtr.Zero)!=0)throw new Exception("decrypt");byte[] plain=new byte[output.len];Marshal.Copy(output.data,plain,0,plain.Length);try{return Encoding.UTF8.GetString(plain);}finally{Array.Clear(plain,0,plain.Length);} }
  finally{if(output.data!=IntPtr.Zero)SECITEM_ZfreeItem(ref output,0);Marshal.FreeHGlobal(ptr);Array.Clear(bytes,0,bytes.Length);}
 }
}
'@
try {
 $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
 if ($request.mode -eq 'dpapi') {
  $values = @(); foreach ($encoded in $request.values) { try { $plain=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($encoded),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$values += [Convert]::ToBase64String($plain);[Array]::Clear($plain,0,$plain.Length) } catch { $values += $null } }
  [Console]::Write((@{ok=$true;values=$values} | ConvertTo-Json -Compress -Depth 6));exit
 }
 if ($request.mode -ne 'nss') { throw 'mode' }
 $library=[IO.Path]::Combine([string]$request.directory,'nss3.dll')
 if ([NocturneNss]::LoadLibraryEx($library,[IntPtr]::Zero,0x1100) -eq [IntPtr]::Zero) { throw 'library' }
 if ([NocturneNss]::NSS_Init([Text.Encoding]::UTF8.GetBytes('sql:'+[string]$request.profile+[char]0)) -ne 0) { throw 'profile' }
 $slot=[NocturneNss]::PK11_GetInternalKeySlot()
 try {
  $password=[Text.Encoding]::UTF8.GetBytes(([string]$request.password)+[char]0)
  try { $unlocked=[NocturneNss]::PK11_CheckUserPassword($slot,$password) -eq 0 } finally { [Array]::Clear($password,0,$password.Length) }
  if (-not $unlocked) { [Console]::Write('{"ok":false,"code":"primary-password"}');exit }
  $source=Get-Content -LiteralPath ([IO.Path]::Combine([string]$request.profile,'logins.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
  $entries=@();$failed=0
  foreach ($login in $source.logins) {
   try { $username=[NocturneNss]::Decrypt([string]$login.encryptedUsername);$password=[NocturneNss]::Decrypt([string]$login.encryptedPassword);$entries += @{url=[string]$login.hostname;username=$username;password=$password} } catch { $failed++ }
  }
  [Console]::Write((@{ok=$true;entries=$entries;failed=$failed} | ConvertTo-Json -Compress -Depth 6))
 } finally { if($slot -ne [IntPtr]::Zero){[NocturneNss]::PK11_FreeSlot($slot)};[void][NocturneNss]::NSS_Shutdown() }
} catch { [Console]::Write('{"ok":false,"code":"native-unavailable"}') }
