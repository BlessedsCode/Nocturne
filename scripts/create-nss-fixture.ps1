param([string]$LibraryDirectory,[string]$ProfileDirectory,[string]$PrimaryPassword='')
$ErrorActionPreference='Stop'
$sourcePath=if($PSScriptRoot){Join-Path $PSScriptRoot '../native/password-import.ps1'}else{Join-Path (Get-Location) 'native/password-import.ps1'}
$code=Get-Content -LiteralPath $sourcePath -Raw
$match=[regex]::Match($code,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@")
Add-Type -TypeDefinition $match.Groups[1].Value
if([NocturneNss]::LoadLibraryEx((Join-Path $LibraryDirectory 'nss3.dll'),[IntPtr]::Zero,0x1100) -eq [IntPtr]::Zero){throw 'Cannot load installed NSS library for fixture'}
New-Item -ItemType Directory -Path $ProfileDirectory -Force | Out-Null
if([NocturneNss]::NSS_InitReadWrite([Text.Encoding]::UTF8.GetBytes('sql:'+$ProfileDirectory+[char]0)) -ne 0){throw 'Fixture NSS init failed'}
$slot=[NocturneNss]::PK11_GetInternalKeySlot()
try{
 $password=[Text.Encoding]::UTF8.GetBytes($PrimaryPassword+[char]0)
 if([NocturneNss]::PK11_InitPin($slot,[IntPtr]::Zero,$password) -ne 0){throw 'Fixture pin failed'}
 if([NocturneNss]::PK11_CheckUserPassword($slot,$password) -ne 0){throw 'Fixture authentication failed'}
 function Protect-Fixture([string]$value){
  $bytes=[Text.Encoding]::UTF8.GetBytes($value);$ptr=[Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  $output=New-Object NocturneNss+Item;$key=New-Object NocturneNss+Item;$inputItem=New-Object NocturneNss+Item
  try{[Runtime.InteropServices.Marshal]::Copy($bytes,0,$ptr,$bytes.Length);$inputItem.data=$ptr;$inputItem.len=$bytes.Length
   if([NocturneNss]::PK11SDR_EncryptWithMechanism($slot,[ref]$key,0x1082,[ref]$inputItem,[ref]$output,[IntPtr]::Zero) -ne 0){throw 'Fixture encryption failed'}
   $encrypted=New-Object byte[] $output.len;[Runtime.InteropServices.Marshal]::Copy($output.data,$encrypted,0,$encrypted.Length);return [Convert]::ToBase64String($encrypted)
  }finally{if($output.data -ne [IntPtr]::Zero){[NocturneNss]::SECITEM_ZfreeItem([ref]$output,0)};[Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)}
 }
 $data=@{logins=@(@{hostname='https://synthetic-nocturne.example';encryptedUsername=(Protect-Fixture 'fixture-user');encryptedPassword=(Protect-Fixture 'SYNTHETIC_ONLY_123')})}
 [IO.File]::WriteAllText((Join-Path $ProfileDirectory 'logins.json'),($data | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
}finally{[NocturneNss]::PK11_FreeSlot($slot);[void][NocturneNss]::NSS_Shutdown()}
Write-Output 'Synthetic NSS fixture created.'
