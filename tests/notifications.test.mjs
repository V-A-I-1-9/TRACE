import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationFeed } from '../src/lib/schedule.ts'

test('concert and coupon retain source dates and enter different reminder windows', () => {
  const event = { id: 'e', memory_id: 'm', kind: 'GENERIC', title: 'Concert', date: '2027-03-14' }
  const coupon = { ...event, id: 'c', title: 'Voucher', kind: 'COUPON_EXPIRY' }
  const before = notificationFeed([event, coupon], [], new Date('2027-03-07'))
  assert.deepEqual(before.map(n => [n.title, n.due, n.date]), [['Voucher', true, event.date], ['Concert', false, event.date]])
  assert.equal(notificationFeed([event], [], new Date('2027-03-11T18:30:00Z'))[0].due, true)
  assert.equal(notificationFeed([event], [], new Date('2027-03-15')).length, 0)
  const reminder = {event_id:'e', reminder_date:'2027-03-05', status:'PENDING'}
  assert.equal(notificationFeed([event], [reminder], new Date('2027-03-05'))[0].due, true)
  assert.equal(notificationFeed([event], [{...reminder, status:'COMPLETED'}], new Date('2027-03-05')).length, 0)
})
