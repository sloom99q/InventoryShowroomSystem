// WhatsApp click-to-chat: the message is ready in the customer's language, editable; "Open WhatsApp"
// opens the chat with it and the send is logged on the car. The manager presses send in WhatsApp.
import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useLogMessage } from '@/api/aftersales'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { friendlyError } from '@/lib/supabase'
import { formatPhone, type MessageKind, waLink } from '@/lib/whatsapp'

export type WaTarget = { vehicleId: string; customerId: string | null; name: string; phone: string; language: 'ar' | 'en'; kind: MessageKind; text: string }

export function WhatsAppIcon({ className }: { className?: string }) {
  return <MessageCircle className={className} aria-hidden />
}

export function WaButton({ label, onClick, className, solid }: { label: string; onClick: () => void; className?: string; solid?: boolean }) {
  return (
    <button onClick={onClick} data-wa={label}
      className={cn('inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[14px] font-semibold transition-colors',
        solid ? 'bg-[#1fa855] text-white hover:bg-[#1a9049]' : 'bg-[#1fa855]/12 text-[#147a3d] hover:bg-[#1fa855]/20', className)}>
      <WhatsAppIcon className="size-4" />{label}
    </button>
  )
}

export function WhatsAppDialog({ target, onClose }: { target: WaTarget; onClose: () => void }) {
  const { t } = useTranslation(['aftersales', 'common'])
  const [text, setText] = useState(target.text)
  const log = useLogMessage(target.vehicleId)
  const open = () => {
    window.open(waLink(target.phone, text), '_blank', 'noopener')
    log.mutate({ customerId: target.customerId, kind: target.kind, text, phone: target.phone }, {
      onSuccess: () => { toast.success(t('wa.logged')); onClose() },
      onError: (e) => toast.error(friendlyError(e)),
    })
  }
  return (
    <Dialog open onClose={onClose} size="md" title={t('wa.title', { name: target.name })}
      description={`${formatPhone(target.phone)} · ${t(`lang.${target.language}`)}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button onClick={open} loading={log.isPending} disabled={!text.trim()} className="bg-[#1fa855] text-white hover:bg-[#1a9049]" data-testid="open-whatsapp">
          <WhatsAppIcon />{t('wa.open')}
        </Button>
      </>}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} dir={target.language === 'ar' ? 'rtl' : 'ltr'} lang={target.language}
        aria-label={t('wa.message')} data-testid="wa-text"
        className="w-full rounded-xl border-0 bg-[#e7f8ea] p-4 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-[#1fa855]/40" />
      <p className="mt-2 text-[13px] text-ink-3">{t('wa.hint')}</p>
    </Dialog>
  )
}
