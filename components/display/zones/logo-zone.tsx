import Image from 'next/image'

interface Props {
  orgName: string
  logoUrl: string | null
  theme: 'dark' | 'light'
}

export function LogoZone({ orgName, logoUrl, theme }: Props) {
  const isDark = theme === 'dark'
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
      {logoUrl ? (
        <div className="relative w-48 h-48">
          <Image src={logoUrl} alt={orgName} fill className="object-contain" />
        </div>
      ) : (
        <div className={`w-40 h-40 rounded-2xl flex items-center justify-center text-5xl font-bold ${
          isDark ? 'bg-zinc-800 text-white' : 'bg-gray-100 text-gray-800'
        }`}>
          {orgName.charAt(0).toUpperCase()}
        </div>
      )}
      <p className={`text-2xl font-bold text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {orgName}
      </p>
    </div>
  )
}
