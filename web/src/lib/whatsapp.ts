// WhatsApp v1 (free): click-to-chat. The app writes the message in the customer's language;
// the manager can edit it, opens WhatsApp and presses send. Automatic sending is v2 (paid).

/** A phone number as WhatsApp needs it (+9715…). UAE local formats are understood. Null when it isn't a number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('00')) d = '+' + d.slice(2)
  if (!d.startsWith('+')) {
    if (/^0(5\d{8}|[2-9]\d{7})$/.test(d)) d = '+971' + d.slice(1) // 050 555 0142, 04 123 4567
    else if (/^5\d{8}$/.test(d)) d = '+971' + d // 50 555 0142
    else if (/^971\d{8,9}$/.test(d)) d = '+' + d
    else return null
  }
  return /^\+[1-9]\d{6,14}$/.test(d) ? d : null
}

/** "+971 50 555 0142" for display. */
export function formatPhone(p: string | null | undefined) {
  if (!p) return ''
  const m = /^\+971(5\d)(\d{3})(\d{4})$/.exec(p)
  return m ? `+971 ${m[1]} ${m[2]} ${m[3]}` : p
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`
}

export type MessageKind = 'service' | 'warranty' | 'part' | 'offer' | 'free'
export type MessageContext = {
  firstName: string
  car: string
  chassis6: string
  company: string
  days?: number | null
  dueDate?: string | null
  part?: string | null
  offer?: string | null
}

/** The ready message for a reminder, in the customer's language (Arabic or English). */
export function messageText(kind: MessageKind, lang: 'ar' | 'en', c: MessageContext): string {
  const car = `${c.car} (…${c.chassis6})`
  if (lang === 'ar') {
    const hi = `مرحباً ${c.firstName}،`
    switch (kind) {
      case 'service':
        return c.days !== null && c.days !== undefined && c.days < 0
          ? `${hi}\nموعد صيانة سيارتكم ${car} قد حان.\nيسعدنا حجز موعد لكم هذا الأسبوع.\n${c.company}`
          : `${hi}\nنذكّركم بموعد الصيانة القادم لسيارتكم ${car}${c.dueDate ? ` بتاريخ ${c.dueDate}` : ''}.\nيسعدنا حجز موعد لكم.\n${c.company}`
      case 'warranty':
        return `${hi}\nضمان سيارتكم ${car} ينتهي بعد ${c.days ?? ''} يوماً.\nيمكنكم تمديده، هل تودّون معرفة التفاصيل؟\n${c.company}`
      case 'part':
        return `${hi}\nوصلت قطعة الغيار (${c.part ?? ''}) لسيارتكم ${car}.\nمتى يناسبكم موعد التركيب؟\n${c.company}`
      case 'offer':
        return `${hi}\nلدينا عرض لسيارتكم ${car}: ${c.offer ?? ''}.\nهل تودّون معرفة التفاصيل؟\n${c.company}`
      default:
        return `${hi}\n\n${c.company}`
    }
  }
  const hi = `Hello ${c.firstName},`
  switch (kind) {
    case 'service':
      return c.days !== null && c.days !== undefined && c.days < 0
        ? `${hi}\nYour ${car} is due for its service.\nWe'd be happy to book you in this week.\n${c.company}`
        : `${hi}\nA reminder that your ${car} has a service coming up${c.dueDate ? ` on ${c.dueDate}` : ''}.\nShall we book a time?\n${c.company}`
    case 'warranty':
      return `${hi}\nThe warranty on your ${car} ends in ${c.days ?? ''} days.\nYou can extend it — would you like the details?\n${c.company}`
    case 'part':
      return `${hi}\nThe part for your ${car} (${c.part ?? ''}) has arrived.\nWhen suits you for fitting?\n${c.company}`
    case 'offer':
      return `${hi}\nWe have an offer for your ${car}: ${c.offer ?? ''}.\nWould you like the details?\n${c.company}`
    default:
      return `${hi}\n\n${c.company}`
  }
}
