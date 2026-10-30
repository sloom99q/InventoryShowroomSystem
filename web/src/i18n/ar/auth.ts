import type { Messages } from '../types'
import type en from '../en/auth'

const ar: Messages<typeof en> = {
  title: 'تسجيل الدخول',
  subtitle: 'يتم إنشاء الحسابات من قبل مدير المعرض.',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  submit: 'دخول',
  wrong: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  noAccessTitle: 'هذا الحساب ليس لديه صلاحية دخول للمعرض',
  noAccessBody: 'اطلب من المدير إضافتك كموظف أو إعادة تفعيل حسابك.',
}
export default ar
